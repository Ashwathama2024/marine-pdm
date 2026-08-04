// Physical cause chain knowledge per sensor — seeded from marine engineering

export interface CauseDetail {
  principle: string;
  causes: string[];
  correlates: string[];
  actionWindow: string;
}

export interface CauseChain {
  sensorId: string;
  displayName: string;
  highDeviation: CauseDetail;
  lowDeviation: CauseDetail;
}

export const CAUSE_CHAINS: CauseChain[] = [
  {
    sensorId: 'ME.ExhaustTemp',
    displayName: 'Exhaust Temperature',
    highDeviation: {
      principle: 'Combustion heat not being converted to work — inefficient combustion or excess fuel. Higher exhaust temp means more energy leaving via gas rather than via crankshaft.',
      causes: [
        'Injector wear or fouling — degraded spray pattern, poor atomisation, incomplete combustion',
        'Fuel quality degradation — high viscosity, water contamination, wrong cetane number',
        'VIT (Variable Injection Timing) mismatch — retarded timing wastes heat in exhaust stroke',
        'Combustion chamber deposits — carbon buildup on piston crown or liner',
        'Turbocharger fouling limiting air supply — rich mixture burns late',
      ],
      correlates: ['ME.SFOC rises', 'ME.FuelRailPressure may dip (−15 bar per faulted injector)', 'Cylinder temperature imbalance if single unit affected'],
      actionWindow: '4–8 hours if gradual rise. Immediate if above L2 (455°C). Check individual cylinder temps for isolated injector fault.',
    },
    lowDeviation: {
      principle: 'Insufficient fuel reaching combustion chamber or over-lean mixture. Low exhaust temp means less energy input — engine under-performing.',
      causes: [
        'Blocked fuel supply — dirty suction strainer or fine filter',
        'Stuck fuel rack at low position — governor or mechanical fault',
        'Early injection timing — combustion ends before full expansion',
        'Fuel supply pressure low — booster pump fault or supply valve partially closed',
      ],
      correlates: ['ME.FuelRailPressure drops — the rail cannot hold pressure on low supply', 'ME.SFOC rises (poor efficiency)', 'Power output drops'],
      actionWindow: 'Investigate within 2 hours. If progressive and load cannot be maintained, reduce speed and investigate fuel system.',
    },
  },
  {
    sensorId: 'ME.LubeOilPressure',
    displayName: 'Lube Oil Pressure',
    highDeviation: {
      principle: 'Increased resistance in the oil circuit. Excess pressure risks over-stressing seals and gaskets, and may indicate a blocked bypass.',
      causes: [
        'Clogged lube oil filter — high differential pressure across filter elements',
        'High oil viscosity — cold start or wrong grade oil',
        'Pressure relief valve stuck closed or set too high',
      ],
      correlates: ['LO filter differential pressure rises', 'Oil temperature may be low'],
      actionWindow: 'Check LO filter differential pressure immediately. If above limit, change filter. Not safety-critical at high side unless PRV stuck.',
    },
    lowDeviation: {
      principle: 'Insufficient oil film on bearing surfaces — SAFETY CRITICAL. Loss of hydrodynamic lubrication leads to metal-to-metal contact and bearing failure within minutes.',
      causes: [
        'Worn lube oil pump — reduced flow capacity at high wear clearances',
        'Oil leakage — ruptured pipe, cracked cooler, failed seal',
        'High oil temperature — viscosity loss reduces film strength (check cooler)',
        'Pressure relief valve stuck open — bypasses oil back to sump',
        'Oil dilution by fuel — leaked fuel injector dilutes viscosity',
        'Main bearing wear — increased clearances drop pressure',
      ],
      correlates: ['Oil temperature rises', 'If bearing fitted with thermocouples, bearing temp rises sharply'],
      actionWindow: 'IMMEDIATE below L2 (3.2 bar). Below L4 (2.5 bar) — AUTO SHUTDOWN. Do not override shutdown unless alternative lubrication confirmed.',
    },
  },
  // ME.FuelRack chain removed — it described a mechanical governor ('rack approaches L2 limit
  // (100mm)', 'check rack linkage for binding') on a common-rail engine that has neither. The
  // equivalent common-rail signal is rail pressure; see the ME.FuelRailPressure entries.
  {
    sensorId: 'ME.ScavengeAirPressure',
    displayName: 'Scavenge Air Pressure',
    highDeviation: {
      principle: 'TC delivering more compressed air than normal — could indicate restriction downstream (back-pressure) or TC running faster than expected.',
      causes: [
        'Scavenge air cooler (intercooler) fouling — high differential pressure builds upstream',
        'Scavenge ports partially blocked — carbon deposits restricting flow',
        'TC running in surge condition — unstable air delivery',
      ],
      correlates: ['ME.TCSpeed also elevated', 'Exhaust temperature may rise'],
      actionWindow: 'Check intercooler differential pressure. Schedule cleaning at next opportunity if DP elevated.',
    },
    lowDeviation: {
      principle: 'TC not delivering adequate charge air. At high load, insufficient scavenge air causes rich mixture, high exhaust temps and sooting.',
      causes: [
        'TC compressor fouling — salt deposits on impeller blades reduce flow coefficient',
        'TC turbine fouling — carbon deposits on nozzle ring restrict gas flow',
        'Charge air cooler (intercooler) heavily fouled — air-side blocked',
        'TC bearing wear — reduced speed due to increased friction',
        'Air filter/inlet screen restricted',
        'Aftermath of scavenge fire — carbon deposits lining scavenge trunking',
      ],
      correlates: ['ME.TCSpeed also low', 'ME.ExhaustTemp rises', 'ME.SFOC rises'],
      actionWindow: 'Perform TC compressor water wash at next opportunity. If TC speed also low, schedule bearing inspection at port.',
    },
  },
  {
    sensorId: 'ME.TCSpeed',
    displayName: 'Turbocharger Speed',
    highDeviation: {
      principle: 'TC receiving more exhaust energy than normal or surging. High TC speed risks overspeed damage to blades.',
      causes: [
        'High exhaust gas energy from high load or over-fuelling',
        'TC surge — compressor operating left of surge line, speed oscillates high',
        'Nozzle ring erosion — unrestricted gas flow spins TC faster',
      ],
      correlates: ['ME.ScavengeAir pressure also elevated'],
      actionWindow: 'If above L1 (17000 RPM), reduce load. Monitor for surge noise (cyclic roar). L4 shutdown at 20500 RPM.',
    },
    lowDeviation: {
      principle: 'TC not receiving adequate exhaust energy or mechanical restriction. Low TC speed starves engine of air.',
      causes: [
        'TC bearing failure — increased friction reduces shaft speed',
        'TC turbine fouling — blocked nozzle ring reduces gas velocity',
        'Low exhaust energy — engine running light load or exhaust temp low',
      ],
      correlates: ['ME.ScavengeAir also low', 'ME.ExhaustTemp rises as combustion worsens'],
      actionWindow: 'Check TC bearing vibration. If speed consistently low at normal loads, schedule TC inspection.',
    },
  },
  {
    sensorId: 'ME.JacketCoolingOutlet',
    displayName: 'Jacket Cooling Outlet',
    highDeviation: {
      principle: 'Cooling water not removing heat from cylinder jackets at expected rate. Risk of thermal overload of liner, piston and cylinder head.',
      causes: [
        'Scale buildup inside jacket cooling passages — calcium carbonate from hard water reduces heat transfer coefficient',
        'Fresh water cooler fouled — seawater side blocked with marine growth or scale',
        'Jacket cooling water pump worn — reduced flow rate',
        'Thermostat stuck partially closed — restricts coolant flow',
        'Air lock in cooling circuit — vapour bubble interrupting flow',
      ],
      correlates: ['ME.ExhaustTemp rises', 'ME.SFOC rises', 'Engine power may need to be reduced'],
      actionWindow: 'If above L2 (90°C) reduce load by 10%. Schedule chemical cleaning of FW cooler and jacket passages at next port.',
    },
    lowDeviation: {
      principle: 'Over-cooling of cylinders. While seemingly safe, cold liners cause acid condensation, ring/liner wear, and thermal cracking from sharp temperature gradients.',
      causes: [
        'Thermostat stuck fully open — no temperature regulation',
        'Cooling water flow rate excessive — overcooled at low load',
        'Low ambient seawater temperature amplifying cooler performance',
      ],
      correlates: ['Lube oil consumption may increase', 'Cylinder liner wear rate increases over time'],
      actionWindow: 'Check thermostat operation. At low loads in cold water, reduce cooling water flow or fit thermostat bypass.',
    },
  },
  {
    sensorId: 'ME.SFOC',
    displayName: 'Specific Fuel Oil Consumption',
    highDeviation: {
      principle: 'Consuming more fuel per kWh of useful output — a composite indicator of engine thermodynamic health. SFOC rise is the sum of all inefficiencies present.',
      causes: [
        'Hull fouling — vessel requires more power for same speed, diluting kWh denominator',
        'Injector wear — incomplete combustion, more fuel for same power',
        'Scavenge air restriction (TC fouling) — poor air/fuel ratio',
        'Jacket cooling inefficiency — heat lost to cooling rather than work',
        'Fuel oil quality — low calorific value fuel requires more mass flow',
        'Propeller pitch deviation — propeller not at design angle',
        'Engine timing drift — suboptimal combustion phasing',
      ],
      correlates: ['Fuel burn up for the same shaft power', 'ME.ExhaustTemp may rise', 'Multiple sensors elevated'],
      actionWindow: 'SFOC is a lagging indicator. Investigate primary causes (injectors, TC, cooling) before next voyage. Hull cleaning at next dry dock.',
    },
    lowDeviation: {
      principle: 'Burning less fuel per kWh — typically positive (improved efficiency). May indicate favorable sea/wind conditions or recent maintenance.',
      causes: [
        'Recent hull or propeller cleaning',
        'Favorable current or following sea',
        'New or recently serviced fuel injectors',
      ],
      correlates: ['All other sensors within normal range'],
      actionWindow: 'No action required. Log as positive event for trending.',
    },
  },
];

export function getCauseChain(sensorId: string): CauseChain | null {
  return CAUSE_CHAINS.find(c => c.sensorId === sensorId) ?? null;
}
