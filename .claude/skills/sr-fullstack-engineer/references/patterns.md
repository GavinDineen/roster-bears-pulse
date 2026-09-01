# Canonical Patterns Reference

## Supabase RLS Policy Templates

```sql
-- Users can only read their own rows
CREATE POLICY "owner_read" ON public.table_name
  FOR SELECT USING (auth.uid() = user_id);

-- Users can only insert rows they own
CREATE POLICY "owner_insert" ON public.table_name
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Users can only update their own rows
CREATE POLICY "owner_update" ON public.table_name
  FOR UPDATE USING (auth.uid() = user_id);

-- Service role bypass (for server-side ops)
-- Use supabase client initialized with SERVICE_ROLE_KEY, not anon key

-- Health/PHI data: restrict to treating provider + patient
CREATE POLICY "provider_or_patient" ON public.health_records
  FOR SELECT USING (
    auth.uid() = patient_id OR
    auth.uid() = provider_id
  );
```

---

## TanStack Query + Zustand Split Pattern

**Rule:** TanStack Query owns server state. Zustand owns client/UI state. Never mix.

```ts
// queries/usePatient.ts — server state
export function usePatient(patientId: string) {
  return useQuery({
    queryKey: ['patient', patientId],
    queryFn: () => patientService.getById(patientId),
    staleTime: 1000 * 60 * 5,
  });
}

export function useUpdatePatient() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: patientService.update,
    onSuccess: (_, { patientId }) => {
      queryClient.invalidateQueries({ queryKey: ['patient', patientId] });
    },
  });
}

// store/uiStore.ts — client state only (no server data)
interface UIStore {
  selectedPatientId: string | null;
  sidebarOpen: boolean;
  setSelectedPatient: (id: string | null) => void;
  toggleSidebar: () => void;
}

export const useUIStore = create<UIStore>((set) => ({
  selectedPatientId: null,
  sidebarOpen: true,
  setSelectedPatient: (id) => set({ selectedPatientId: id }),
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
}));
```

---

## Webhook Signature Verification

```ts
// Generic HMAC-SHA256
import crypto from 'crypto';

export function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string
): boolean {
  const expected = crypto
    .createHmac('sha256', secret)
    .update(payload, 'utf8')
    .digest('hex');
  // Timing-safe compare
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expected)
  );
}

// Stripe
import Stripe from 'stripe';
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export function verifyStripeWebhook(
  body: Buffer,
  sig: string
): Stripe.Event {
  return stripe.webhooks.constructEvent(
    body,
    sig,
    process.env.STRIPE_WEBHOOK_SECRET!
  );
}

// Handler pattern — return 200 fast, process async
export async function POST(req: Request) {
  const body = await req.text();
  const sig = req.headers.get('stripe-signature')!;
  
  let event: Stripe.Event;
  try {
    event = verifyStripeWebhook(Buffer.from(body), sig);
  } catch {
    return new Response('Invalid signature', { status: 400 });
  }

  // Acknowledge immediately
  void processWebhookAsync(event); // fire and forget
  return new Response('OK', { status: 200 });
}
```

---

## MCP Tool Schema Boilerplate

```ts
import { z } from 'zod';

const GetPatientSchema = z.object({
  patientId: z.string().uuid(),
  includeHistory: z.boolean().default(false),
});

export const getPatientTool = {
  name: 'get_patient',
  description: 'Retrieve a patient record by ID. Optionally include visit history.',
  inputSchema: GetPatientSchema,
  handler: async (input: z.infer<typeof GetPatientSchema>) => {
    const parsed = GetPatientSchema.safeParse(input);
    if (!parsed.success) {
      return { error: parsed.error.flatten() };
    }
    try {
      const patient = await patientService.getById(parsed.data.patientId, parsed.data.includeHistory);
      return { data: patient };
    } catch (err) {
      return { error: 'Failed to retrieve patient', detail: String(err) };
    }
  },
};
```

---

## Supabase Migration File Structure

```
supabase/
  migrations/
    20240101000000_create_patients.sql
    20240102000000_add_rls_patients.sql
    20240103000000_add_visit_history.sql
```

```sql
-- 20240101000000_create_patients.sql
CREATE TABLE public.patients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  date_of_birth DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_patients_user_id ON public.patients(user_id);

-- Enable RLS (always — even before policies are added)
ALTER TABLE public.patients ENABLE ROW LEVEL SECURITY;
```

---

## Auth Middleware Pattern

```ts
// middleware.ts (Next.js App Router)
import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const PROTECTED_PATHS = ['/dashboard', '/patients', '/admin'];

export async function middleware(req: NextRequest) {
  const res = NextResponse.next();
  const supabase = createMiddlewareClient({ req, res });
  const { data: { session } } = await supabase.auth.getSession();

  const isProtected = PROTECTED_PATHS.some(p => req.nextUrl.pathname.startsWith(p));

  if (isProtected && !session) {
    const redirectUrl = req.nextUrl.clone();
    redirectUrl.pathname = '/login';
    redirectUrl.searchParams.set('redirectTo', req.nextUrl.pathname);
    return NextResponse.redirect(redirectUrl);
  }

  return res;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/public).*)'],
};
```

---

## Environment Variable Config Pattern

```ts
// lib/config.ts — single source of truth
const required = (key: string): string => {
  const value = process.env[key];
  if (!value) throw new Error(`Missing required env var: ${key}`);
  return value;
};

export const config = {
  supabase: {
    url: required('NEXT_PUBLIC_SUPABASE_URL'),
    anonKey: required('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
    serviceRoleKey: required('SUPABASE_SERVICE_ROLE_KEY'), // server-only
  },
  stripe: {
    secretKey: required('STRIPE_SECRET_KEY'),
    webhookSecret: required('STRIPE_WEBHOOK_SECRET'),
  },
  app: {
    url: required('NEXT_PUBLIC_APP_URL'),
    env: process.env.NODE_ENV ?? 'development',
    isProd: process.env.NODE_ENV === 'production',
  },
} as const;
```

---

## CLI Flag Parsing Boilerplate

```ts
// cli/index.ts
import { parseArgs } from 'node:util';

const { values, positionals } = parseArgs({
  args: process.argv.slice(2),
  options: {
    input: { type: 'string', short: 'i' },
    output: { type: 'string', short: 'o' },
    dryRun: { type: 'boolean', default: false },
    verbose: { type: 'boolean', short: 'v', default: false },
  },
  allowPositionals: true,
});

if (values.dryRun) {
  console.log('[dry-run] No changes will be written.');
}

// Always: meaningful exit codes
process.exit(0); // success
process.exit(1); // user error (bad input, missing arg)
process.exit(2); // runtime error
```
