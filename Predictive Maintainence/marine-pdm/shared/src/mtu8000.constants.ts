// shared/mtu8000.constants.ts — Single source of truth for all MTU 8000 M71/M71L values.
// All values from MTU 8000 technical documentation and PDF upgrade spec §2.

// ── ENGINE IDENTITY ───────────────────────────────────────────────────────────
export const MTU8000 = {
  MODEL: '20V 8000 M71/M71L',
  CYLINDERS: 20,
  V_ANGLE_DEG: 48,
  BORE_MM: 265,
  STROKE_MM: 315,
  RATED_RPM: 1150,
  MAX_POWER_KW: 9100,   // M71L variant
  KW_PER_CYL: 455,      // M71L
  APPLICATION: '1B',    // high-load variable profile

  // Cylinder names: A-side = left from driving end, B-side = right
  // Numbering: 1 = driving end (KS), 10 = free end (KGS)
  CYL_NAMES: [
    'A1','A2','A3','A4','A5','A6','A7','A8','A9','A10',
    'B1','B2','B3','B4','B5','B6','B7','B8','B9','B10',
  ] as const,

  // Firing order — counter-clockwise (standard for propulsion)
  FIRING_ORDER_CCW: [
    'A1','B6','A6','B8','A8','B2','A2','B4','A4','B10',
    'A10','B5','A5','B3','A3','B9','A9','B7','A7','B1',
  ] as const,

  // Load profile Group 1B
  LOAD_PROFILE: {
    pct100_timeShare: 0.03,   // 3% at 100% load
    pct85_timeShare:  0.82,   // 82% at 85% load — PRIMARY OPERATING POINT
    pct15_timeShare:  0.15,   // 15% below 15% (manoeuvring/standby)
    nominalLoad: 85,           // design point for baseline curves
  },

  RPM: { min: 400, idle: 400, nominal: 1150, rated: 1150, max: 1200 },
  LOAD: { min: 10, manoeuvre: 15, cruise: 85, max: 100 },
} as const;

// ── HARD LIMITS & ECS ALARM THRESHOLDS ───────────────────────────────────────
export const MTU8000_LIMITS = {
  // Exhaust temperatures (B4.1–B4.20)
  exhaust: {
    normal_max: 480,    // °C — HI T-Exhaust alarm
    critical_max: 530,  // °C — SS Emergency Stop
    mean_hi: 460,       // °C — HI T-Exhaust Mean (B4.30)
    spread_warn: 30,    // °C — imbalance warning
    spread_alarm: 50,   // °C — imbalance alarm
  },

  // Lube oil (B5.1–B5.5, B57.1–B57.11)
  lubeOil: {
    // LO gallery pressure at rated (85%/1150) settles to ~6.4 bar due to hot-oil viscosity.
    // Pre-alarm at 5.5 bar aligns with ALARM_LIMITS.lubeOilPressure.preAlarmLow.
    pressure_before_filter_min: 5.5,   // bar — B5.1 LO pre-alarm (was 6.5, too tight for hot oil)
    pressure_after_filter_min:  5.0,   // bar — B5.5 (was 6.0)
    pressure_last_bearing_min:  2.0,   // bar — B5.3/B5.4 SS Emergency Stop (recal: idle 400 RPM gives ~2.67 bar)
    piston_cooling_min:         4.0,   // bar — B5.2 (was 4.5, physics gives ~4.35 bar at rated)
    temp_max:                   115,   // °C — B7 HI T-Oil
    // Bearings at rated (85%/1150) with hot oil (~105°C) naturally reach ~107°C.
    // Thresholds raised to match real MTU 8000 operational data.
    // MTU ZNG00028788 (ALARM/GRENZWERTLISTE) codes T-Bearing Lim2 = 120 °C shutdown, Lim1 = 115 °C
    // warning. This was 130 because an earlier 120/100 pair fired false — but that was the HI at 100,
    // which sat BELOW the ~112 °C a healthy hottest bearing reaches at rated (107 mean + the +5
    // positionBias). With HI already corrected to 115, the OEM 120 leaves 8 °C of headroom above
    // healthy and is the number the ECS actually trips on.
    bearing_temp_max:           120,   // °C — B57.x SS T-Bearing (OEM T-Bearing Lim2)
    bearing_temp_hi:            115,   // °C — B57.x HI T-Bearing (was 100, too low for hot oil at rated)
  },

  // Cooling system (B6.x, B16.x)
  cooling: {
    coolant_temp_after_engine_max: 95,   // °C — B6.1 HI T-Coolant
    coolant_temp_ss:               97,   // °C — SS T-Coolant (OEM T-Coolant Lim2, ZNG00028788)
    coolant_pressure_min:          1.5,  // bar — B16.1 LO P-Coolant
    raw_water_pressure_min:        1.0,  // bar — B21
  },

  // Charge air (B9, B10)
  chargeAir: {
    pressure_nominal_at_85pct:       3.2,  // bar — at 85% load 1150 RPM
    // Charge air after the LT intercooler runs ~63°C at rated (LT coolant 36°C + boost/approach
    // rise — see chargeAirTemp_MTU8000). Band raised above rated: the old 50/55 sat BELOW the
    // rated value (internally inconsistent — it never fired only because risk is deviation-based).
    temp_after_intercooler_max:      80,   // °C — B9 max
    temp_after_intercooler_hi:       75,   // °C — HI T-Charge Air (rated ~63 + 12°C margin)
  },

  // Fuel rail (B48, B34.x)
  fuel: {
    rail_pressure_nominal:  1800,  // bar — common rail
    rail_pressure_min:      1200,  // bar — SD P-Fuel (Rail) → Emergency Op
    filter_dp_warn:         0.8,   // bar — B34.1 minus B34.2
    temp_max:               50,    // °C — B33 (OEM T-Fuel Lim2, ZNG00028788; Lim1 warning is 45)
  },

  // Turbocharger (B44.x) — MTU 20V 8000 M71/M91 sequential ETCs
  turbocharger: {
    speed_idle:               7000,  // RPM — basic TCs at engine idle (~400 RPM)
    speed_nominal_at_85pct:  28000,  // RPM — rated nominal (4 TCs active)
    speed_cut_in:            37000,  // RPM — TC speed condition for 3rd/4th cut-in
    speed_cut_out_4to3:      28000,  // RPM — TC speed condition for 4→3 cut-out
    speed_cut_out_3to2:      26000,  // RPM — TC speed condition for 3→2 cut-out
    speed_overspeed_l1:      40500,  // RPM — Yellow alarm
    speed_overspeed_l2:      41000,  // RPM — Power limitation
  },

  // Crankcase (B50)
  // Hottest-bearing position bias, from bearingTemp_MTU8000's `positionBias` (index 10 → +5 °C,
  // indices 8–9 → +3). Every bearing shares the same load/rpm/oil terms, so at healthy the hottest is
  // always the one carrying the largest bias — which is what the MAX-of-11 observable reports and
  // what the SS T-Bearing override trips on. The shared ME.BearingTemp.Mean curve is per-bearing and
  // deliberately excludes it; whoever reduces the 11 to a max adds it back.
  bearingMaxPositionBias: 5,

  crankcase: {
    pressure_hi: 5,    // mbar — HI P-Crankcase
    pressure_normal: -2, // mbar — normal slightly negative (ventilation)
  },
} as const;

// ── CYLINDER EXHAUST TEMP SPREAD ──────────────────────────────────────────────
// Natural offset from mean (°C) for a healthy MTU 8000 at 85% load, 1150 RPM.
// Index order: A1,A2,A3,A4,A5,A6,A7,A8,A9,A10, B1,B2,B3,B4,B5,B6,B7,B8,B9,B10
export const MTU8000_CYL_SPREAD: number[] = [
  // A-side (driving end → free end)
  -8, +12, -4, +16, -6, +10, -3, +14, -9, +7,
  // B-side (driving end → free end)
  +5, -11, +9, -5, +13, -7, +11, -2, +8, -4,
];

// B-side sensors run naturally hotter due to V-angle heat accumulation
export const BSIDE_TEMP_BIAS = +4; // °C — B-side structurally warmer than A-side
