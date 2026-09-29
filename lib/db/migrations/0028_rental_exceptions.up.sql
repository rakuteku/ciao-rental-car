-- Private evidence-backed rental incidents and claims.
BEGIN;

CREATE TABLE rental_incidents (
  id serial PRIMARY KEY,
  reservation_id integer NOT NULL REFERENCES rental_reservations(id) ON DELETE CASCADE,
  operator_id integer NOT NULL REFERENCES rental_operators(id),
  category text NOT NULL,
  severity text NOT NULL DEFAULT 'medium',
  status text NOT NULL DEFAULT 'open',
  description text NOT NULL,
  unsafe_vehicle boolean NOT NULL DEFAULT false,
  prior_operational_status text,
  location text,
  people_involved jsonb NOT NULL DEFAULT '[]'::jsonb,
  police_reported boolean NOT NULL DEFAULT false,
  police_reference text,
  roadside_details text,
  insurer_reference text,
  tow_details text,
  replacement_vehicle_details text,
  downtime_start timestamptz,
  downtime_end timestamptz,
  next_booking_impact text,
  customer_update text,
  reported_by_type text NOT NULL,
  reported_by_id text NOT NULL,
  occurred_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rental_incidents_severity_check CHECK (severity IN ('low','medium','high','critical')),
  CONSTRAINT rental_incidents_status_check CHECK (status IN ('open','under_review','resolved'))
);
CREATE INDEX rental_incidents_reservation_idx ON rental_incidents(reservation_id, created_at);
CREATE INDEX rental_incidents_operator_status_idx ON rental_incidents(operator_id, status);

CREATE TABLE rental_claims (
  id serial PRIMARY KEY,
  reservation_id integer NOT NULL REFERENCES rental_reservations(id) ON DELETE CASCADE,
  incident_id integer REFERENCES rental_incidents(id) ON DELETE SET NULL,
  operator_id integer NOT NULL REFERENCES rental_operators(id),
  status text NOT NULL DEFAULT 'draft',
  currency text NOT NULL DEFAULT 'jpy',
  invoice_reference text,
  insurer_outcome text,
  customer_response text,
  customer_responded_at timestamptz,
  provider_charge_status text NOT NULL DEFAULT 'not_configured',
  total_amount integer NOT NULL DEFAULT 0,
  submitted_at timestamptz,
  decided_at timestamptz,
  decided_by text,
  decision text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rental_claims_status_check CHECK (status IN ('draft','submitted','disputed','approved','rejected','closed')),
  CONSTRAINT rental_claims_currency_check CHECK (currency = 'jpy'),
  CONSTRAINT rental_claims_provider_charge_status_check CHECK (provider_charge_status IN ('not_configured','not_charged')),
  CONSTRAINT rental_claims_total_check CHECK (total_amount >= 0)
);
CREATE INDEX rental_claims_reservation_idx ON rental_claims(reservation_id, created_at);
CREATE INDEX rental_claims_operator_status_idx ON rental_claims(operator_id, status);

CREATE TABLE rental_claim_items (
  id serial PRIMARY KEY,
  claim_id integer NOT NULL REFERENCES rental_claims(id) ON DELETE CASCADE,
  category text NOT NULL DEFAULT 'repair',
  description text NOT NULL,
  amount integer NOT NULL CHECK (amount > 0),
  status text NOT NULL DEFAULT 'pending_platform_review',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rental_claim_items_status_check CHECK (status IN ('pending_platform_review','disputed','approved','rejected')),
  CONSTRAINT rental_claim_items_category_check CHECK (category IN ('deductible','repair','cleaning','noc'))
);
CREATE INDEX rental_claim_items_claim_idx ON rental_claim_items(claim_id);

CREATE TABLE rental_exception_evidence (
  token text PRIMARY KEY,
  reservation_id integer NOT NULL REFERENCES rental_reservations(id) ON DELETE CASCADE,
  operator_id integer NOT NULL REFERENCES rental_operators(id),
  incident_id integer REFERENCES rental_incidents(id) ON DELETE CASCADE,
  claim_id integer REFERENCES rental_claims(id) ON DELETE CASCADE,
  claim_item_id integer REFERENCES rental_claim_items(id) ON DELETE CASCADE,
  inspection_id integer REFERENCES rental_inspections(id) ON DELETE CASCADE,
  evidence_kind text NOT NULL DEFAULT 'incident',
  content_type text NOT NULL,
  uploaded_at timestamptz,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rental_exception_evidence_context_check CHECK (
    (evidence_kind IN ('pickup','return') AND inspection_id IS NOT NULL) OR
    (evidence_kind IN ('incident','invoice','insurer','customer_response') AND (incident_id IS NOT NULL OR claim_id IS NOT NULL))
  ),
  CONSTRAINT rental_exception_evidence_kind_check CHECK (evidence_kind IN ('incident','pickup','return','invoice','insurer','customer_response'))
);
CREATE INDEX rental_exception_evidence_reservation_idx ON rental_exception_evidence(reservation_id);
CREATE INDEX rental_exception_evidence_incident_idx ON rental_exception_evidence(incident_id);
CREATE INDEX rental_exception_evidence_claim_idx ON rental_exception_evidence(claim_id);
CREATE INDEX rental_exception_evidence_inspection_idx ON rental_exception_evidence(inspection_id);

CREATE TABLE rental_exception_events (
  id serial PRIMARY KEY,
  reservation_id integer NOT NULL REFERENCES rental_reservations(id) ON DELETE CASCADE,
  incident_id integer REFERENCES rental_incidents(id) ON DELETE CASCADE,
  claim_id integer REFERENCES rental_claims(id) ON DELETE CASCADE,
  claim_item_id integer REFERENCES rental_claim_items(id) ON DELETE CASCADE,
  actor_type text NOT NULL,
  actor_id text NOT NULL,
  event_type text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX rental_exception_events_reservation_idx ON rental_exception_events(reservation_id, created_at);

COMMIT;