import { context, trace, metrics, SpanStatusCode, type Attributes } from '@opentelemetry/api';
import { WebTracerProvider } from '@opentelemetry/sdk-trace-web';
import { InMemorySpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { MeterProvider, InMemoryMetricExporter, PeriodicExportingMetricReader, AggregationTemporality } from '@opentelemetry/sdk-metrics';

// Local, bounded diagnostics only. No remote exporter or content-capturing auto instrumentation.
class BoundedExporter extends InMemorySpanExporter {
  override export(...args: Parameters<InMemorySpanExporter['export']>) {
    if (this.getFinishedSpans().length >= 200) this.reset();
    super.export(...args);
  }
}
export const diagnosticSpans = new BoundedExporter();
const provider = new WebTracerProvider({ spanProcessors: [new SimpleSpanProcessor(diagnosticSpans)] });
class BoundedMetricExporter extends InMemoryMetricExporter {
  override export(...args:Parameters<InMemoryMetricExporter['export']>) {this.reset();super.export(...args);}
}
const metricExporter = new BoundedMetricExporter(AggregationTemporality.CUMULATIVE);
const meterProvider = new MeterProvider({ readers: [new PeriodicExportingMetricReader({ exporter: metricExporter, exportIntervalMillis: 30000 })] });
const tracer = provider.getTracer('health-os-integrations', '1');
const meter = meterProvider.getMeter('health-os-integrations', '1');
const latency = meter.createHistogram('health_os.operation.duration', { unit: 'ms' });
const outcomes = meter.createCounter('health_os.operation.count');
const allowed = new Set(['domain', 'operation', 'outcome', 'count', 'cache_hit', 'stale', 'steps', 'approved']);
export function safeAttributes(input: Attributes): Attributes {
  return Object.fromEntries(Object.entries(input).filter(([key, value]) => allowed.has(key) && (typeof value === 'boolean' || typeof value === 'number' && Number.isFinite(value) || typeof value === 'string' && /^[a-z0-9_.-]{1,50}$/i.test(value))));
}
export async function observe<T>(name: string, attributes: Attributes, work: () => Promise<T>, parent = context.active()): Promise<T> {
  const operation = /^[a-z0-9_.-]{1,80}$/i.test(name) ? name : 'health_os.operation';
  const attrs = safeAttributes(attributes), span = tracer.startSpan(operation, { attributes: attrs }, parent), start = performance.now();
  try {
    const result = await work(); span.setStatus({ code: SpanStatusCode.OK });
    outcomes.add(1, { operation, outcome: 'success' }); return result;
  } catch (error) {
    // Exception messages may contain model prompts, notes or credentials. Never record them.
    span.setStatus({ code: SpanStatusCode.ERROR }); outcomes.add(1, { operation, outcome: 'failure' }); throw error;
  } finally { latency.record(performance.now() - start, { operation }); span.end(); }
}
export function observeSync<T>(name: string, work: () => T): T {
  const span = tracer.startSpan(name), start = performance.now();
  try { const result = work(); span.setStatus({ code: SpanStatusCode.OK }); return result; }
  catch (error) { span.setStatus({ code: SpanStatusCode.ERROR }); throw error; }
  finally { latency.record(performance.now() - start, { operation: name }); span.end(); }
}
export const telemetryContext = (span: ReturnType<typeof tracer.startSpan>) => trace.setSpan(context.active(), span);
export const startIntelligenceSpan = () => tracer.startSpan('health_intelligence.run');
export function clearDiagnostics() { diagnosticSpans.reset(); metricExporter.reset(); }
export async function disposeTelemetry() { await Promise.all([provider.shutdown(), meterProvider.shutdown()]); }
