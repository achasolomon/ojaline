import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { eventSchemas, SCHEMA_VERSIONS, type EventType } from '../src/events.js';

/**
 * Generates one JSON Schema per event type into packages/contracts/schemas/.
 * CI validates every outbox payload against these (ADR-003/008).
 */
const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, '..', 'schemas');
mkdirSync(outDir, { recursive: true });

for (const [eventType, schema] of Object.entries(eventSchemas) as [EventType, (typeof eventSchemas)[EventType]][]) {
  const jsonSchema = zodToJsonSchema(schema, { $refStrategy: 'none' });
  const file = join(outDir, `${eventType}.schema.json`);
  writeFileSync(file, JSON.stringify({ event_type: eventType, schema_version: SCHEMA_VERSIONS[eventType], ...jsonSchema }, null, 2));
  console.log(`generated ${eventType} (v${SCHEMA_VERSIONS[eventType]})`);
}
