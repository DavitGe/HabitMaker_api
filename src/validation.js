import { z } from 'zod';
export const credentials = z.object({ email: z.email().max(254).transform(v => v.toLowerCase()), password: z.string().min(10).max(128) });
const challenge = z.object({
  id: z.string().min(1).max(80), title: z.string().trim().min(1).max(100), category: z.string().trim().min(1).max(30),
  days: z.array(z.number().int().min(0).max(6)).min(1).max(7).refine(days => new Set(days).size === days.length, 'Duplicate weekdays').optional(),
}).strict();
const unique = items => new Set(items.map(c => c.id)).size === items.length;
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v => {
  const d = new Date(`${v}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}, 'Invalid calendar date');
export const stateSchema = z.object({
  challenges: z.array(challenge).max(30).refine(unique, 'Duplicate challenge IDs'),
  entries: z.array(z.object({
    date,
    challenges: z.array(challenge).max(30).refine(unique, 'Duplicate challenge IDs'),
    completed: z.array(z.string()).max(30),
    note: z.string().max(1000),
  }).strict().refine(e => new Set(e.completed).size === e.completed.length && e.completed.every(id => e.challenges.some(c => c.id === id)), 'Invalid completed challenges')).max(10000),
}).strict().refine(s => new Set(s.entries.map(e => e.date)).size === s.entries.length, 'Duplicate entry dates');
