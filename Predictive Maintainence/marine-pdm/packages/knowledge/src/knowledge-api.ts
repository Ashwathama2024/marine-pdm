import express, { type Express, type Request, type Response } from 'express';
import { registry, baselineStore, dependencyMap, patternLibrary } from './singletons';

const app: Express = express();
app.use(express.json());

// ── SENSORS ────────────────────────────────────────────────────────────────

app.get('/sensors', (_req: Request, res: Response) => {
  res.json(registry.getAll());
});

app.post('/sensors', (req: Request, res: Response) => {
  try {
    const sensor = registry.addSensor(req.body);
    res.status(201).json(sensor);
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

app.post('/sensors/:id/activate', (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const hasBaseline = baselineStore.hasCurve(id);
    registry.activateSensor(id, hasBaseline);
    res.json({ id, status: 'ACTIVE' });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

app.get('/sensors/:id/observation', (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const hasBaseline = baselineStore.hasCurve(id);
    res.json(registry.getObservationStatus(id, hasBaseline));
  } catch (e) {
    res.status(404).json({ error: (e as Error).message });
  }
});

// ── BASELINES ──────────────────────────────────────────────────────────────

app.get('/baselines/:sensorId', (req: Request, res: Response) => {
  const { sensorId } = req.params;
  res.json(baselineStore.getCurveHistory(sensorId));
});

app.post('/baselines', (req: Request, res: Response) => {
  try {
    baselineStore.addCurve(req.body);
    res.status(201).json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

app.get('/baselines/:sensorId/expected', (req: Request, res: Response) => {
  const { sensorId } = req.params;
  const load = parseFloat(req.query['load'] as string);
  const rpm = parseFloat(req.query['rpm'] as string);
  const coolingEff = parseFloat((req.query['coolingEff'] as string) ?? '1');

  if (isNaN(load) || isNaN(rpm)) {
    res.status(400).json({ error: 'load and rpm query params required' });
    return;
  }

  const expected = baselineStore.getExpected(sensorId, { load, rpm, coolingEff });
  if (expected === null) {
    res.status(404).json({ error: 'No active baseline or out of valid load range' });
    return;
  }
  res.json({ sensorId, expected, load, rpm });
});

// ── DEPENDENCIES ───────────────────────────────────────────────────────────

app.get('/dependencies', (_req: Request, res: Response) => {
  res.json(dependencyMap.getAll());
});

app.post('/dependencies', (req: Request, res: Response) => {
  const { sensorId, dependsOn, correlationCoefficients } = req.body;
  if (!sensorId || !Array.isArray(dependsOn)) {
    res.status(400).json({ error: 'sensorId and dependsOn[] required' });
    return;
  }
  dependencyMap.addDependency(sensorId, dependsOn, correlationCoefficients ?? {});
  res.status(201).json({ ok: true });
});

// ── PATTERNS ───────────────────────────────────────────────────────────────

app.get('/patterns', (_req: Request, res: Response) => {
  res.json(patternLibrary.getAll());
});

app.post('/patterns', (req: Request, res: Response) => {
  try {
    patternLibrary.addPattern(req.body);
    res.status(201).json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

app.post('/patterns/:id/feedback', (req: Request, res: Response) => {
  const { id } = req.params;
  const { outcome } = req.body;
  if (outcome !== 'CONFIRMED' && outcome !== 'FALSE_POSITIVE') {
    res.status(400).json({ error: "outcome must be 'CONFIRMED' or 'FALSE_POSITIVE'" });
    return;
  }
  try {
    patternLibrary.recordOutcome(id, outcome);
    const suggestion = patternLibrary.getSuggestedThresholdAdjustment(id);
    res.json({ ok: true, suggestion });
  } catch (e) {
    res.status(404).json({ error: (e as Error).message });
  }
});

app.get('/patterns/:id/suggestion', (req: Request, res: Response) => {
  const suggestion = patternLibrary.getSuggestedThresholdAdjustment(req.params['id']);
  res.json({ suggestion });
});

const PORT = process.env['KNOWLEDGE_PORT'] ?? 3001;
app.listen(PORT, () => {
  console.log(`Knowledge API running on port ${PORT}`);
});

export default app;
