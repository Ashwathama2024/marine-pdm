import React, { createContext, useContext, useState } from 'react';

interface SensorFocusCtx {
  focus: string | null;                 // sensorId (e.g. 'ME.ExhaustTemp') or null = show all
  setFocus: (s: string | null) => void;
}

// Default is a no-op with focus=null, so pages that read this WITHOUT a provider
// (e.g. the standalone /deviations, /table routes) behave exactly as before — no filtering.
const Ctx = createContext<SensorFocusCtx>({ focus: null, setFocus: () => {} });

export function SensorFocusProvider({ children }: { children: React.ReactNode }) {
  const [focus, setFocus] = useState<string | null>(null);
  return <Ctx.Provider value={{ focus, setFocus }}>{children}</Ctx.Provider>;
}

export function useSensorFocus(): SensorFocusCtx {
  return useContext(Ctx);
}

// Sensors offered in the workspace focus rail — must match the sensorIds used by the
// deviation views (DeviationDashboard / DeviationTable).
export const FOCUS_SENSORS: { id: string; label: string }[] = [
  { id: 'ME.ExhaustTemp',         label: 'Exhaust'     },
  { id: 'ME.LubeOilPressure',     label: 'LO Press'    },
  { id: 'ME.ScavengeAirPressure', label: 'Charge Air'  },
  { id: 'ME.ChargeAirTemp',       label: 'Air Temp'    },
  { id: 'ME.TCSpeed',             label: 'TC Speed'    },
  { id: 'ME.JacketCoolingOutlet', label: 'Jacket'      },
  { id: 'ME.FuelOilPressure',     label: 'Fuel Press'  },
  { id: 'ME.FuelOilTemp',         label: 'Fuel Temp'   },
  { id: 'ME.LOFilterDP',          label: 'LO Filter'   },
  { id: 'ME.PistonCoolingPress',  label: 'Piston Cool' },
  { id: 'ME.SFOC',                label: 'SFOC'        },
];

// FaultAlert (live decision alerts) carries no sensorId — only free text (component,
// ecsAlarmCode, patternName, issue). Map each focus sensor → keyword regex so those
// alerts can be matched to the focused sensor.
const SENSOR_KEYWORDS: Record<string, RegExp> = {
  'ME.ExhaustTemp':         /exhaust|t-exh|cyl/i,
  'ME.LubeOilPressure':     /lube|oil|lo |p-oil|bearing/i,
  'ME.ScavengeAirPressure': /charge air|scavenge|boost/i,
  'ME.ChargeAirTemp':       /charge air|t-charge/i,
  'ME.TCSpeed':             /turbo|tc |etc/i,
  'ME.JacketCoolingOutlet': /cool|coolant|jacket/i,
  'ME.FuelOilPressure':     /fuel/i,
  'ME.FuelOilTemp':         /fuel/i,
  'ME.LOFilterDP':          /filter|oil|lube/i,
  'ME.PistonCoolingPress':  /piston|oil/i,
  'ME.SFOC':                /sfoc|efficiency|combustion/i,
};

// True when a free-text fault alert relates to the focused sensor (null focus = match all).
export function alertTextMatchesSensor(focus: string | null, text: string): boolean {
  if (!focus) return true;
  const re = SENSOR_KEYWORDS[focus];
  return re ? re.test(text) : false;
}

// Maps a focus sensorId → the TrendChart sparkline label it corresponds to (only the
// 5 sensors that have a sparkline). Used to highlight/dim the trends view.
export const SENSOR_TO_SPARKLINE: Record<string, string> = {
  'ME.ExhaustTemp':         'Exhaust',
  'ME.LubeOilPressure':     'LO Pressure',
  'ME.JacketCoolingOutlet': 'Jacket Outlet',
  'ME.TCSpeed':             'TC Speed',
  'ME.SFOC':                'SFOC',
};

// Maps a focus sensorId → SensorHistory histKey. DegradationEvent.sensor is a histKey
// (not a sensorId), so this is how degradation events are matched to the focused sensor.
export const SENSOR_TO_HISTKEY: Record<string, string> = {
  'ME.ExhaustTemp':         'exhaustTemp',
  'ME.LubeOilPressure':     'lubeOilPressure',
  'ME.ScavengeAirPressure': 'scavengeAir',
  'ME.ChargeAirTemp':       'chargeAirTemp',
  'ME.TCSpeed':             'tcRPM',
  'ME.JacketCoolingOutlet': 'jacketOutlet',
  'ME.FuelOilPressure':     'fuelOilPressure',
  'ME.FuelOilTemp':         'fuelOilTemp',
  'ME.LOFilterDP':          'loFilterDP',
  'ME.PistonCoolingPress':  'pistonCoolingPress',
  'ME.SFOC':                'sfoc',
};

// The focus sensorId that the per-cylinder exhaust view corresponds to.
export const CYLINDER_FOCUS_SENSOR = 'ME.ExhaustTemp';
