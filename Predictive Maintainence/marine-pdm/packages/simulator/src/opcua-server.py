"""
MarineGPT PDM — OPC-UA Server (Phase 6)
Namespace : urn:marinegpt:pdm:v1  (ns=2)
Port      : 4840
Tags      : 30 (see TAG_DEFS below)
Interval  : 1000 ms publishing, 0.5% deadband

Requirements:
    pip install asyncua

Run:
    python opcua-server.py

The server simulates marine engine physics identical to the TypeScript
SimulatorEngine so the one-line swap test is valid for integration testing.
"""

import asyncio
import math
import random
import logging
from asyncua import Server, ua
from asyncua.ua import NodeId, NodeClass

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("marinegpt-opcua")

# ── Physics coefficients (mirror of TypeScript constants.ts) ─────────────────
TICK_MS = 1000
CYL_SPREAD = [-5, 8, -3, 12, -7, 4]  # °C offset from mean per cylinder
COOLING_EFF_INIT = 1.0
LAG_EXHAUST = 0.08
LAG_LUBE = 0.05
LAG_FUEL_RACK = 0.12
LAG_SCAVENGE = 0.10
LAG_TC_RPM = 0.07
LAG_JACKET = 0.06
LAG_SFOC = 0.09

# ── Tag definitions ───────────────────────────────────────────────────────────
TAG_DEFS = [
    # (node_id_string, display_name, unit, initial_value, deadband_pct)
    ("ME.RPM",                      "Main Engine RPM",                "RPM",    720.0, 0.5),
    ("ME.Load",                     "Main Engine Load",               "%",       65.0, 0.5),
    ("ME.ExhaustTemp",              "Mean Exhaust Temperature",       "°C",     350.0, 0.5),
    ("ME.LubeOilPressure",          "Lube Oil Pressure",              "bar",      4.7, 0.5),
    ("ME.FuelRack",                 "Fuel Rack Position",             "mm",      65.0, 0.5),
    ("ME.ScavengeAirPressure",      "Scavenge Air Pressure",          "bar",      2.2, 0.5),
    ("ME.TCSpeed",                  "Turbocharger Speed",             "RPM",  12000.0, 0.5),
    ("ME.JacketCoolingOutlet",      "Jacket Cooling Water Outlet",    "°C",      80.0, 0.5),
    ("ME.SFOC",                     "Specific Fuel Oil Consumption",  "g/kWh",  175.0, 0.5),
    ("ME.CoolingEfficiency",        "Cooling Efficiency Factor",      "",         1.0, 0.5),
    ("ME.Cyl1.ExhaustTemp",         "Cylinder 1 Exhaust Temp",        "°C",     345.0, 0.5),
    ("ME.Cyl2.ExhaustTemp",         "Cylinder 2 Exhaust Temp",        "°C",     358.0, 0.5),
    ("ME.Cyl3.ExhaustTemp",         "Cylinder 3 Exhaust Temp",        "°C",     347.0, 0.5),
    ("ME.Cyl4.ExhaustTemp",         "Cylinder 4 Exhaust Temp",        "°C",     362.0, 0.5),
    ("ME.Cyl5.ExhaustTemp",         "Cylinder 5 Exhaust Temp",        "°C",     343.0, 0.5),
    ("ME.Cyl6.ExhaustTemp",         "Cylinder 6 Exhaust Temp",        "°C",     354.0, 0.5),
    # Extended tags (total = 30)
    ("ME.FuelPressure",             "Fuel Injection Pressure",        "bar",     850.0, 0.5),
    ("ME.ChargeAirTemp",            "Charge Air Temperature",         "°C",       45.0, 0.5),
    ("ME.ExhaustManifoldPressure",  "Exhaust Manifold Pressure",      "bar",       1.1, 0.5),
    ("ME.LubeOilTemp",              "Lube Oil Temperature",           "°C",       60.0, 0.5),
    ("ME.FWCoolantTemp",            "Fresh Water Coolant Temp",       "°C",       70.0, 0.5),
    ("ME.SWCoolantTemp",            "Sea Water Coolant Temp",         "°C",       28.0, 0.5),
    ("ME.CrankshaftRPM",            "Crankshaft RPM",                 "RPM",    720.0, 0.5),
    ("ME.BearingTemp1",             "Main Bearing 1 Temperature",     "°C",       65.0, 0.5),
    ("ME.BearingTemp2",             "Main Bearing 2 Temperature",     "°C",       66.0, 0.5),
    ("ME.PropellerPitch",           "Propeller Pitch",                "%",        72.0, 0.5),
    ("ME.AirStartPressure",         "Air Start Pressure",             "bar",      28.0, 0.5),
    ("ME.GovernorOutput",           "Governor Output Signal",         "%",        65.0, 0.5),
    ("ME.EGBInletTemp",             "Exhaust Gas Boiler Inlet Temp",  "°C",      330.0, 0.5),
    ("ME.EGBOutletTemp",            "Exhaust Gas Boiler Outlet Temp", "°C",      180.0, 0.5),
]

assert len(TAG_DEFS) == 30, f"Expected 30 tags, got {len(TAG_DEFS)}"


def apply_lag(prev: float, target: float, alpha: float) -> float:
    return prev + alpha * (target - prev)


def add_noise(value: float, magnitude: float) -> float:
    return value + random.uniform(-magnitude, magnitude)


class PhysicsState:
    def __init__(self, rpm: float = 720.0, load: float = 65.0):
        self.rpm = rpm
        self.load = load
        self.cooling_eff = COOLING_EFF_INIT
        self.lube_fault = 0.0
        self.inj_faults = [0.0] * 6

        # Lagged values — initialised to steady-state
        base_exhaust = 250 + (load * 1.4) + (rpm / 700 * 10) / self.cooling_eff
        self.exhaust_temp = base_exhaust
        self.lube_oil_pressure = 4.2 + (rpm / 700 * 0.8) - (load * 0.005) - self.lube_fault * 1.8
        self.fuel_rack = 20 + load * 0.8 + rpm / 700 * 5
        self.scavenge_air = 0.5 + (rpm / 700 * 2.0) * (load / 100)
        self.tc_rpm = 8000 + (rpm / 700 * 6000) * (load / 100) ** 0.5
        self.jacket_outlet = 70 + (load * 0.12) / self.cooling_eff
        self.sfoc = 200 - (load * 0.4) - (rpm / 700 * 10) + self.lube_fault * 8
        self.cyl_temps = [base_exhaust + CYL_SPREAD[i] for i in range(6)]


class PhysicsEngine:
    def __init__(self):
        self.state = PhysicsState()

    def tick(self) -> dict:
        s = self.state
        rpm, load, ce = s.rpm, s.load, s.cooling_eff

        target_exhaust = 250 + (load * 1.4) + (rpm / 700 * 10) / ce
        s.exhaust_temp = apply_lag(s.exhaust_temp, target_exhaust, LAG_EXHAUST)

        target_lube = 4.2 + (rpm / 700 * 0.8) - (load * 0.005) - s.lube_fault * 1.8
        s.lube_oil_pressure = apply_lag(s.lube_oil_pressure, target_lube, LAG_LUBE)

        target_fuel = 20 + load * 0.8 + rpm / 700 * 5
        s.fuel_rack = apply_lag(s.fuel_rack, target_fuel, LAG_FUEL_RACK)

        target_scav = 0.5 + (rpm / 700 * 2.0) * (load / 100)
        s.scavenge_air = apply_lag(s.scavenge_air, target_scav, LAG_SCAVENGE)

        target_tc = 8000 + (rpm / 700 * 6000) * math.sqrt(load / 100)
        s.tc_rpm = apply_lag(s.tc_rpm, target_tc, LAG_TC_RPM)

        target_jacket = 70 + (load * 0.12) / ce
        s.jacket_outlet = apply_lag(s.jacket_outlet, target_jacket, LAG_JACKET)

        target_sfoc = 200 - (load * 0.4) - (rpm / 700 * 10) + s.lube_fault * 8
        s.sfoc = apply_lag(s.sfoc, target_sfoc, LAG_SFOC)

        for i in range(6):
            target_cyl = target_exhaust + CYL_SPREAD[i] + s.inj_faults[i] * 45
            s.cyl_temps[i] = apply_lag(s.cyl_temps[i], target_cyl, LAG_EXHAUST)

        return {
            "ME.RPM":                     add_noise(s.rpm, 5),
            "ME.Load":                    add_noise(s.load, 0.5),
            "ME.ExhaustTemp":             add_noise(s.exhaust_temp, 1.5),
            "ME.LubeOilPressure":         add_noise(s.lube_oil_pressure, 0.05),
            "ME.FuelRack":                add_noise(s.fuel_rack, 0.3),
            "ME.ScavengeAirPressure":     add_noise(s.scavenge_air, 0.02),
            "ME.TCSpeed":                 add_noise(s.tc_rpm, 50),
            "ME.JacketCoolingOutlet":     add_noise(s.jacket_outlet, 0.5),
            "ME.SFOC":                    add_noise(s.sfoc, 2),
            "ME.CoolingEfficiency":       s.cooling_eff,
            "ME.Cyl1.ExhaustTemp":        add_noise(s.cyl_temps[0], 1.5),
            "ME.Cyl2.ExhaustTemp":        add_noise(s.cyl_temps[1], 1.5),
            "ME.Cyl3.ExhaustTemp":        add_noise(s.cyl_temps[2], 1.5),
            "ME.Cyl4.ExhaustTemp":        add_noise(s.cyl_temps[3], 1.5),
            "ME.Cyl5.ExhaustTemp":        add_noise(s.cyl_temps[4], 1.5),
            "ME.Cyl6.ExhaustTemp":        add_noise(s.cyl_temps[5], 1.5),
            # Extended tags (approximations)
            "ME.FuelPressure":            add_noise(850 + s.load * 0.5, 5),
            "ME.ChargeAirTemp":           add_noise(40 + s.load * 0.08, 0.5),
            "ME.ExhaustManifoldPressure": add_noise(1.0 + s.load * 0.002, 0.02),
            "ME.LubeOilTemp":             add_noise(58 + s.load * 0.03, 0.3),
            "ME.FWCoolantTemp":           add_noise(68 + s.load * 0.03, 0.3),
            "ME.SWCoolantTemp":           add_noise(28, 0.2),
            "ME.CrankshaftRPM":           add_noise(s.rpm, 5),
            "ME.BearingTemp1":            add_noise(63 + s.load * 0.03, 0.2),
            "ME.BearingTemp2":            add_noise(64 + s.load * 0.03, 0.2),
            "ME.PropellerPitch":          add_noise(s.load * 1.1, 0.5),
            "ME.AirStartPressure":        add_noise(28, 0.1),
            "ME.GovernorOutput":          add_noise(s.load, 0.3),
            "ME.EGBInletTemp":            add_noise(s.exhaust_temp * 0.94, 2),
            "ME.EGBOutletTemp":           add_noise(180, 2),
        }


async def main():
    server = Server()
    await server.init()

    server.set_endpoint("opc.tcp://0.0.0.0:4840/marinegpt/pdm")
    server.set_server_name("MarineGPT PDM OPC-UA Server")

    # Namespace
    uri = "urn:marinegpt:pdm:v1"
    idx = await server.register_namespace(uri)
    log.info(f"Namespace index: {idx} ({uri})")

    # Create object to hold all tags
    objects = server.nodes.objects
    engine_node = await objects.add_object(idx, "MainEngine")

    # Create all variable nodes
    node_map: dict[str, object] = {}
    for (tag_id, display, unit, init_val, deadband) in TAG_DEFS:
        parts = tag_id.split(".")
        parent = engine_node
        # Create sub-objects for cylinders (ME.Cyl1, ME.Cyl2, etc.)
        if len(parts) == 3:
            sub_name = f"{parts[0]}.{parts[1]}"
            # Try to get existing sub-object
            sub_node = None
            for child in await engine_node.get_children():
                bn = await child.read_browse_name()
                if bn.Name == sub_name:
                    sub_node = child
                    break
            if sub_node is None:
                sub_node = await engine_node.add_object(idx, sub_name)
            parent = sub_node

        var = await parent.add_variable(idx, tag_id, float(init_val))
        await var.set_writable()

        # Set EUInformation for unit
        await var.write_attribute(
            ua.AttributeIds.Description,
            ua.DataValue(ua.Variant(ua.LocalizedText(display), ua.VariantType.LocalizedText))
        )

        node_map[tag_id] = var

    log.info(f"Created {len(node_map)} OPC-UA nodes — starting physics simulation")
    physics = PhysicsEngine()

    async with server:
        while True:
            await asyncio.sleep(TICK_MS / 1000)
            values = physics.tick()
            for tag_id, value in values.items():
                node = node_map.get(tag_id)
                if node:
                    await node.write_value(float(value))


if __name__ == "__main__":
    asyncio.run(main())
