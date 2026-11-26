// shared/mtu8000.constants.ts — Single source of truth for all MTU 8000 M71/M71L values.
//
// Every coded alarm threshold below is DERIVED from `oem-limits.ts`, i.e. from MTU drawing
// ZNG00028788, rather than typed in. Where a number here is NOT an OEM value — an app-only
// intermediate step, or a parameter MTU does not code — the comment says so explicitly. That
// distinction is the one the calibration defect was built on: invented thresholds and manual
// thresholds used to be indistinguishable in this file. See OEM-CALIBRATION-GAP.md §1.4.
//
// `oem-limits.ts` imports nothing, so this cannot cycle.
import { oemCurve, oemScalar, OEM_VARIANT } from './oem-limits';

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

  // Crank throws. A 20V shares one throw between the two opposing con-rods, so 20 cylinders sit on
  // 10 throws, carried by 11 main bearings — throw t runs between bearings t and t+1. This is what
  // the ten spray-oil sensors count, not cylinders.
  CRANK_THROWS: 10,

  // Lube-circuit takeoff ratios, as a fraction of main gallery pressure. These describe the
  // engine, not the simulator, which is why they live here rather than in the physics module —
  // both the physics AND the derived limits below need them, and they were previously duplicated
  // across three files with two different pairs of values.
  //
  // Their RELATIVE order is fixed by ZNG00028788: it warns on last-bearing pressure at 5.8 bar
  // (curve 3) but on piston cooling at only 5.2 (curve 1), so the last bearing is the higher of
  // the two. The last main bearing is the far end of the same drilled gallery and loses only the
  // flow-dependent drop; the piston-cooling rail is fed through metering restrictors.
  LUBE_CIRCUIT: {
    lastBearingRatio:   0.92,   // B5.3/B5.4
    pistonCoolingRatio: 0.85,   // B5.2
  },
} as const;

// ── HARD LIMITS & ECS ALARM THRESHOLDS ───────────────────────────────────────

/** The speed every scalar limit below is quoted at. Curve-valued limits vary with speed. */
const RATED = MTU8000.RATED_RPM;

export const MTU8000_LIMITS = {
  // Exhaust temperatures (B4.1–B4.20 — twenty per-cylinder probes in the exhaust ports, i.e.
  // BEFORE the turbine; the location deck names them "Exhaust gas temperature cylinder A1…B10",
  // and the after-turbine sensor is the separate back-pressure one. So curve 10, "Exhaust Temp.
  // (Mean Value)", is the limit that governs the modelled mean. OEM-CALIBRATION-GAP.md §7.3.)
  exhaust: {
    // NOT OEM. An app-only per-cylinder step; MTU bounds a single cylinder relative to the mean
    // (curves 11/12), not with a fixed number. Kept for the gauge band, marked as a guess.
    normal_max: 480,
    // The nearest coded escalation above the mean warning: MDEC 51,03 adds a 20 °C offset, also a
    // warning. MTU codes NO exhaust-temperature shutdown at all, so despite the field name this
    // is not an SS — nothing in ZNG00028788 stops the engine on exhaust temperature.
    critical_max: oemCurve(10, RATED) + 20,   // 720 °C
    // T-Exhaust Mean Lim1, MDEC 2D-50, curve 10, 10 s delay, warning.
    // Was 460 — 240 °C tighter than the code. A healthy engine runs 440 °C here, so the app used
    // to alarm 20 °C above healthy on a limit MTU sets 260 °C above healthy.
    mean_hi: oemCurve(10, RATED),             // 700 °C
    // NOT OEM. Imbalance bands are an app construct; MTU expresses the same idea as the
    // single-cylinder UL/LL curves against the running mean.
    spread_warn: 30,
    spread_alarm: 50,
  },

  // Lube oil (B5.1–B5.5, B57.1–B57.11)
  lubeOil: {
    // ZNG00028788 codes no gallery-pressure limit at all — it monitors the two takeoffs (piston
    // cooling B5.2, last bearing B5.3/B5.4) and the filter ΔP, not B5.1 alone. So the app's
    // gallery pre-alarm has no direct OEM counterpart, but it need not be invented either: the
    // gallery pressure at which the FAR END of the gallery reaches its coded warning is exactly
    // curve 3 divided by the takeoff ratio. That gives the alarm a real meaning — "low enough
    // that the last bearing is about to warn" — and makes it follow engine speed.
    //
    // It was a flat 5.5 bar, chosen when the rated gallery was 6.43. A fixed floor cannot work on
    // a pressure that runs 3.4 bar at idle and 7.2 at rated: after Phase 2 a perfectly healthy
    // engine at 800 RPM / 45 % load sat at 5.41 bar and tripped it. Scalar here is the rated-point
    // value for display; the override resolves the curve (MTU8000_LIMIT_CURVES.galleryPressHI).
    pressure_before_filter_min: oemCurve(3, RATED) / MTU8000.LUBE_CIRCUIT.lastBearingRatio,  // 6.30 bar
    // Same, one filter ΔP lower. Also not directly coded.
    pressure_after_filter_min:  oemCurve(3, RATED) / MTU8000.LUBE_CIRCUIT.lastBearingRatio - 0.15,
    // P-Oil last bearing Lim2, MDEC 2D-29, curve 4, 1.0 s delay, SHUTDOWN.
    // Was 2.0 bar — less than HALF the coded trip. It was lowered to fit a simulator whose last
    // bearing sat at 3.51 bar, which was itself below this shutdown. Both are now fixed: healthy
    // is 6.59 bar at rated. The override resolves the CURVE at the live speed (see
    // MTU8000_LIMIT_CURVES); this scalar is the rated-point value for display.
    pressure_last_bearing_min:  oemCurve(4, RATED),   // 5.3 bar
    // Oil Pressure Piston Cooling Lim1, MDEC 2D-26, curve 1, 5.0 s delay, warning.
    // Was 4.0, with the comment "was 4.5 — physics gives ~4.35 bar at rated": a threshold moved
    // twice to sit under a broken physics value. The physics now gives 6.09 bar.
    piston_cooling_min:         oemCurve(1, RATED),   // 5.2 bar
    temp_max:                   oemScalar('oilTempLim2'),  // °C — B7, T-Oil Lim2 power reduction (was 115)
    // Bearings at rated (85%/1150) with hot oil (~105°C) naturally reach ~107°C.
    // Thresholds raised to match real MTU 8000 operational data.
    // MTU ZNG00028788 (ALARM/GRENZWERTLISTE) codes T-Bearing Lim2 = 120 °C shutdown, Lim1 = 115 °C
    // warning. This was 130 because an earlier 120/100 pair fired false — but that was the HI at 100,
    // which sat BELOW the ~112 °C a healthy hottest bearing reaches at rated (107 mean + the +5
    // positionBias). With HI already corrected to 115, the OEM 120 leaves 8 °C of headroom above
    // healthy and is the number the ECS actually trips on.
    bearing_temp_max:           oemScalar('bearingTempLim2'),  // °C — B57.x T-Bearing Lim2, SHUTDOWN
    bearing_temp_hi:            oemScalar('bearingTempLim1'),  // °C — B57.x T-Bearing Lim1, warning
    bearing_temp_mean_hi:       oemScalar('bearingTempMean'),  // °C — T-Bearing Mean, warning (112)
    bearing_temp_diff_hi:       oemScalar('bearingTempDiff'),  // °C — T-Bearing Diff, warning (20)
  },

  // Cooling system (B6.x, B16.x, B21)
  cooling: {
    coolant_temp_after_engine_max: oemScalar('coolantTempLim1'),  // °C — B6.1/B6.2 Lim1, warning (95)
    coolant_temp_ss:               oemScalar('coolantTempLim2'),  // °C — Lim2, power reduction (97)
    // P-Coolant Lim1, MDEC 2D-16, curve 0, 5.0 s delay, warning. Was 1.5 bar against a 4.1 bar
    // code — but the physics gave only 2.0 bar, so the threshold had been dropped to fit it.
    coolant_pressure_min:          oemCurve(0, RATED),   // 4.1 bar at rated
    // P-Raw Water after Pump Lim1, MDEC 2D-47, curve 8, 10 s delay, warning. Not modelled yet —
    // there is no raw-water pressure in EngineSnapshot — so this has no consumer; corrected here
    // so that the day it is modelled, the limit it is checked against is already the OEM one.
    raw_water_pressure_min:        oemCurve(8, RATED),   // 1.8 bar at rated (was 1.0)
  },

  // Charge air (B9, B10)
  chargeAir: {
    pressure_nominal_at_85pct:       3.2,  // bar — at 85% load 1150 RPM
    // Charge air after the LT intercooler runs ~63°C at rated (LT coolant 36°C + boost/approach
    // rise — see chargeAirTemp_MTU8000). Band raised above rated: the old 50/55 sat BELOW the
    // rated value (internally inconsistent — it never fired only because risk is deviation-based).
    // NOT OEM. ZNG00028788 codes one upper limit for charge air (T-Charge Air UL, 75 °C) and one
    // lower (LL, 20 °C) — there is no second upper step. `_max` is an app-only escalation above it.
    temp_after_intercooler_max:      80,
    temp_after_intercooler_hi:       oemScalar('chargeAirTempUL'),  // °C — B9 UL, warning (75)
    temp_after_intercooler_lo:       oemScalar('chargeAirTempLL'),  // °C — B9 LL, warning (20)
  },

  // Fuel rail (B48, B34.x)
  fuel: {
    // NOT OEM as an absolute band. ZNG00028788 codes a DEVIATION limit on rail pressure
    // (MDEC 18, 50 bar from setpoint, fuel limitation), not a floor — a different concept, so
    // these two stay app values. Recorded as an open item in OEM-CALIBRATION-GAP.md §3.4.
    rail_pressure_nominal:  1800,  // bar — common rail
    rail_pressure_min:      1200,  // bar — app SD floor → Emergency Op
    rail_pressure_deviation: oemScalar('railPressDeviation'),  // bar — MDEC 18, the coded limit
    // P-Fuel Difference Lim1, MDEC 2D-28, curve 7, 10 s delay, warning. B34.1 minus B34.2.
    filter_dp_warn:         oemCurve(7, RATED),   // 1.0 bar at rated (app had 0.8 — conservative)
    temp_max:               oemScalar('fuelTempLim2'),  // °C — B33 T-Fuel Lim2, power reduction (50)
    temp_warn:              oemScalar('fuelTempLim1'),  // °C — B33 T-Fuel Lim1, warning (45)
  },

  // Turbocharger (B44.x) — MTU 20V 8000 M71/M91 sequential ETCs
  turbocharger: {
    speed_idle:               7000,  // RPM — basic TCs at engine idle (~400 RPM)
    speed_nominal_at_85pct:  28000,  // RPM — rated nominal (4 TCs active)
    speed_cut_in:            37000,  // RPM — TC speed condition for 3rd/4th cut-in
    speed_cut_out_4to3:      28000,  // RPM — TC speed condition for 4→3 cut-out
    speed_cut_out_3to2:      26000,  // RPM — TC speed condition for 3→2 cut-out
    speed_overspeed_l1:      OEM_VARIANT.etcOverspeedL1,  // RPM — Turbo Overspeed ETC Limit 1, warning
    speed_overspeed_l2:      OEM_VARIANT.etcOverspeedL2,  // RPM — ETC Limit 2, power reduction
  },

  // Engine overspeed + exhaust back pressure (B13.1, B41.1) — both per build state.
  // OEM-CALIBRATION-GAP.md §7.1: which build state this vessel is remains open. The app matches
  // BM01 on ETC overspeed, so OEM_TARGET_VARIANT is BM01; no Class A parameter depends on it.
  engine: {
    overspeed_shutdown: OEM_VARIANT.engineOverspeedShutdown,  // RPM — 1323 (BM01), shut down
  },
  exhaustBackPressure: {
    warn:            OEM_VARIANT.exhaustBackPressureWarn,       // mbar — MDEC 2D-45, 5 s, warning
    fuel_limitation: oemScalar('exhaustBackPressureFL'),        // mbar — MDEC 3D-107, >70, no delay
  },

  // Spray oil — "Spritzöl" (B77.11–B77.20, ECS channels B1–B10, EMU II connector X5.3)
  //
  // Ten sensors, ONE PER CRANK THROW, low on the B-side crankcase wall — MS15082/00E p38, drawing
  // TD0000012616_096. They read the oil thrown off the con-rod big end, which is how MTU detects a
  // bearing starting to run hot: the oil leaving it warms before anything else does.
  //
  // MTU monitors these DIFFERENTIALLY. Each channel is statically calibrated on a healthy engine
  // (the ECS raises "AL Splash Oil Bn Cal not Pos" and asks for the sensor to be replaced if a
  // channel sits outside its calibration window), and thereafter it is the SPREAD that alarms —
  // "HI T-Splash Oil Bn", cause "Spray-oil temperature too high (1st limit)". There is deliberately
  // no absolute T-Splash Oil band anywhere in ZNG00028788, only these two difference limits.
  //
  // Because the alarm is differential, it is unaffected by the absolute-scale problems recorded in
  // OEM-CALIBRATION-GAP.md — a common offset across all ten channels cancels.
  sprayOil: {
    diff_warn:     oemScalar('splashOilDiffLim1'),   // °C — Lim1, warning,  3 s delay (MDEC 39)
    diff_shutdown: oemScalar('splashOilDiffLim2'),   // °C — Lim2, shutdown, 1 s delay (MDEC 39,01)
  },

  // Crankcase (B50)
  // Hottest-bearing position bias, from bearingTemp_MTU8000's `positionBias` (index 10 → +5 °C,
  // indices 8–9 → +3). Every bearing shares the same load/rpm/oil terms, so at healthy the hottest is
  // always the one carrying the largest bias — which is what the MAX-of-11 observable reports and
  // what the SS T-Bearing override trips on. The shared ME.BearingTemp.Mean curve is per-bearing and
  // deliberately excludes it; whoever reduces the 11 to a max adds it back.
  bearingMaxPositionBias: 5,

  crankcase: {
    // P-Crankcase Lim1, MDEC 2D-18, curve 9, 5.0 s delay, warning. Curve 9 is FLAT at 27 mbar
    // across the whole speed range, so a scalar is faithful here.
    //
    // Was 5 mbar — 19 % of the code. At that threshold F08's full-severity ceiling of 7.28 mbar
    // cleared it easily, which is why it looked calibrated; against the real 27 mbar it could not
    // have fired at all. `FAULT_MAX_EFFECTS.F08_blowby_pressure` grows with this (8 → 45 mbar) so
    // the fault can still reach its own coded alarm. See OEM-CALIBRATION-GAP.md §3.2.
    pressure_hi: oemCurve(9, RATED),          // 27 mbar
    // P-Crankcase Lim2, MDEC 91,05, "Offset (10mbar)", 1.0 s delay, SHUTDOWN — i.e. 10 mbar above
    // Lim1. The app did not model this trip at all before.
    pressure_ss: oemCurve(9, RATED) + 10,     // 37 mbar
    pressure_normal: -2,  // mbar — NOT OEM: the healthy ventilated value, not a limit
  },
} as const;

// ── CURVE-VALUED LIMITS ──────────────────────────────────────────────────────
// The scalars above are each quoted AT RATED SPEED, which is what a display or a documentation
// page wants. A safety check does not: these limits are RPM curves, and at 400 RPM the
// last-bearing shutdown is 2.07 bar, not 5.3. Checking a running engine against the rated-point
// scalar would trip an Emergency Stop on a perfectly healthy idling engine.
//
// Anything that compares a LIVE reading to a limit must therefore resolve the curve at the live
// speed. `applyMTU8000SafetyOverride` does; so do the gauge bands, through ALARM_LIMITS.
export const MTU8000_LIMIT_CURVES = {
  /** P-Oil last bearing Lim2 (2D-29) — SHUTDOWN. */
  lastBearingPressSS:  (rpm: number) => oemCurve(4, rpm),
  /** P-Oil last bearing Lim1 (2D-17) — warning. */
  lastBearingPressHI:  (rpm: number) => oemCurve(3, rpm),
  /** Oil Pressure Piston Cooling Lim2 (2D-27) — SHUTDOWN. */
  pistonCoolingPressSS: (rpm: number) => oemCurve(2, rpm),
  /** Oil Pressure Piston Cooling Lim1 (2D-26) — warning. */
  pistonCoolingPressHI: (rpm: number) => oemCurve(1, rpm),
  /** P-Coolant Lim1 (2D-16) — warning. */
  coolantPressHI:      (rpm: number) => oemCurve(0, rpm),
  /**
   * Main gallery (B5.1). Not itself coded — this is the gallery pressure at which the last
   * bearing reaches its own coded warning (curve 3), so the app's gallery alarm means something
   * traceable and tracks speed instead of being a flat number.
   */
  galleryPressHI:      (rpm: number) => oemCurve(3, rpm) / MTU8000.LUBE_CIRCUIT.lastBearingRatio,
  /** T-Exhaust Mean Lim1 (2D-50) — warning. */
  exhaustMeanHI:       (rpm: number) => oemCurve(10, rpm),
  /** P-Lube Oil Filter Difference (2D-53) — warning. */
  lubeFilterDpHI:      (rpm: number) => oemCurve(5, rpm),
  /** P-Fuel Difference Lim1 (2D-28) — warning. */
  fuelFilterDpHI:      (rpm: number) => oemCurve(7, rpm),
  /** P-Crankcase Lim1 (2D-18) — warning. Flat, but kept here so every check reads the same way. */
  crankcasePressHI:    (rpm: number) => oemCurve(9, rpm),
  /** Single T-Exhaust UL (2D-52) — warning. Indexed by the MEAN exhaust temperature, not RPM. */
  singleExhaustUL:     (meanExhaustC: number) => oemCurve(12, meanExhaustC),
  /** Single T-Exhaust LL (2D-51) — warning. Indexed by the MEAN exhaust temperature, not RPM. */
  singleExhaustLL:     (meanExhaustC: number) => oemCurve(11, meanExhaustC),
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
