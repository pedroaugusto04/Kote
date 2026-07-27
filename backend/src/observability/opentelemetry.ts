import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto';
import { PrometheusExporter } from '@opentelemetry/exporter-prometheus';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { PgInstrumentation } from '@opentelemetry/instrumentation-pg';

const otlpEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://10.0.0.52:4318/v1/traces';
const serviceName = process.env.OTEL_SERVICE_NAME || 'kote-backend';

const traceExporter = new OTLPTraceExporter({
  url: otlpEndpoint,
});

const prometheusExporter = new PrometheusExporter({
  port: 9464,
  endpoint: '/metrics',
});

const sdk = new NodeSDK({
  traceExporter,
  metricReader: prometheusExporter,
  instrumentations: [
    getNodeAutoInstrumentations(),
    new PgInstrumentation(),
  ],
  serviceName,
});

export function initializeOpenTelemetry() {
  sdk.start();
  console.log('OpenTelemetry initialized');
  return prometheusExporter;
}
