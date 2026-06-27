ALTER TABLE public.defects ADD COLUMN IF NOT EXISTS state text;
CREATE INDEX IF NOT EXISTS defects_state_idx ON public.defects(state) WHERE state IS NOT NULL;
COMMENT ON COLUMN public.defects.state IS 'U.S. state / territory code (USPS 2-letter, e.g. CA, NY, DC, PR). Required only for State Filing errors; nullable for backward compatibility.';