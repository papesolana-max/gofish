-- 1. Seed gameplay rule tables ------------------------------------------------
INSERT INTO public.fish_species (id, name, color, rarity, min_weight_kg, max_weight_kg, is_monster, base_price_per_kg) VALUES
  ('clownfish','Clownfish','#f5a623','common',5,40,false,4),
  ('mackerel','Mackerel','#8fd0e8','rare',35,120,false,6),
  ('scad','Scad','#a7e0b0','epic',100,300,false,9),
  ('red_snapper','Red Snapper','#e8734a','legendary',280,650,false,14),
  ('baby_tuna','Baby Tuna','#5b7fa6','mythic',600,1300,false,22),
  ('ancient_leviathan','Ancient Leviathan','#1e46b4','mythic',1200,3000,true,40)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name, color = EXCLUDED.color, rarity = EXCLUDED.rarity,
  min_weight_kg = EXCLUDED.min_weight_kg, max_weight_kg = EXCLUDED.max_weight_kg,
  is_monster = EXCLUDED.is_monster, base_price_per_kg = EXCLUDED.base_price_per_kg;

INSERT INTO public.rarity_base_weights (rarity, base_weight) VALUES
  ('common',100),('rare',45),('epic',18),('legendary',6),('mythic',2)
ON CONFLICT (rarity) DO UPDATE SET base_weight = EXCLUDED.base_weight;

INSERT INTO public.rod_tiers (id, name, max_catch_weight_kg) VALUES
  ('common','Common Rod',100),
  ('rare','Rare Rod',300),
  ('epic','Epic Rod',600),
  ('legendary','Legendary Rod',1000),
  ('mythic','Mythic Rod',2500)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, max_catch_weight_kg = EXCLUDED.max_catch_weight_kg;

INSERT INTO public.bait_tiers (id, name, rarity_multiplier) VALUES
  ('basic_bait','Basic Bait','{"common":1,"rare":1,"epic":1,"legendary":1,"mythic":1}'::jsonb)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, rarity_multiplier = EXCLUDED.rarity_multiplier;

INSERT INTO public.mutations (key, label, multiplier, drop_weight) VALUES
  ('none','Normal',1,55),
  ('big','Big',1.2,15),
  ('dark','Dark',1.3,10),
  ('albino','Albino',1.4,7),
  ('sparkling','Sparkling',1.5,5)
ON CONFLICT (key) DO UPDATE SET label = EXCLUDED.label, multiplier = EXCLUDED.multiplier, drop_weight = EXCLUDED.drop_weight;

INSERT INTO public.weather_effects (weather_kind, bite_window_seconds, rarity_multiplier) VALUES
  ('cerah',1.6,'{}'::jsonb),
  ('berawan',1.6,'{}'::jsonb),
  ('berkabut',1.3,'{"epic":1.3,"legendary":1.3,"mythic":1.3}'::jsonb),
  ('hujan',1.1,'{"epic":1.3,"legendary":1.5,"mythic":1.5}'::jsonb),
  ('badai',0.9,'{"legendary":1.8,"mythic":2.5}'::jsonb)
ON CONFLICT (weather_kind) DO UPDATE SET
  bite_window_seconds = EXCLUDED.bite_window_seconds,
  rarity_multiplier = EXCLUDED.rarity_multiplier;

INSERT INTO public.weather_cycle_config (id, change_interval_seconds, weights) VALUES
  ('default',240,'{"cerah":40,"berawan":25,"berkabut":15,"hujan":12,"badai":8}'::jsonb)
ON CONFLICT (id) DO UPDATE SET
  change_interval_seconds = EXCLUDED.change_interval_seconds, weights = EXCLUDED.weights;

INSERT INTO public.game_config (key, value) VALUES
  ('monster_catch_chance',0.02),
  ('day_length_seconds',720)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

-- 2. XP / level system --------------------------------------------------------
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS xp integer NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.xp_for_rarity(_rarity text)
RETURNS integer LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE _rarity
    WHEN 'common' THEN 10
    WHEN 'rare' THEN 25
    WHEN 'epic' THEN 60
    WHEN 'legendary' THEN 150
    WHEN 'mythic' THEN 400
    ELSE 5 END;
$$;

-- Level curve: level N requires 100 * (N-1)^2 total XP (1 -> 0, 2 -> 100, 3 -> 400, ...)
CREATE OR REPLACE FUNCTION public.level_for_xp(_xp integer)
RETURNS integer LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT greatest(1, floor(sqrt(greatest(_xp,0) / 100.0))::int + 1);
$$;

CREATE OR REPLACE FUNCTION public.record_catch(_wallet text, _rarity text, _species_id text, _weight_kg numeric, _mutation_key text)
RETURNS profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  result public.profiles;
  gained integer;
BEGIN
  INSERT INTO public.fish_inventory_items (wallet_address, species_id, weight_kg, mutation_key)
  VALUES (_wallet, _species_id, _weight_kg, coalesce(_mutation_key, 'none'));

  SELECT greatest(1, round(public.xp_for_rarity(_rarity) *
           coalesce((SELECT m.multiplier FROM public.mutations m WHERE m.key = coalesce(_mutation_key,'none')), 1))::int)
  INTO gained;

  UPDATE public.profiles SET
    fish_common = fish_common + CASE WHEN _rarity = 'common' THEN 1 ELSE 0 END,
    fish_rare = fish_rare + CASE WHEN _rarity = 'rare' THEN 1 ELSE 0 END,
    fish_epic = fish_epic + CASE WHEN _rarity = 'epic' THEN 1 ELSE 0 END,
    fish_legendary = fish_legendary + CASE WHEN _rarity = 'legendary' THEN 1 ELSE 0 END,
    fish_mythic = fish_mythic + CASE WHEN _rarity = 'mythic' THEN 1 ELSE 0 END,
    xp = xp + gained,
    level = public.level_for_xp(xp + gained),
    updated_at = now()
  WHERE wallet_address = _wallet
  RETURNING * INTO result;

  RETURN result;
END;
$function$;

-- Backfill XP for existing profiles from their recorded catches
UPDATE public.profiles SET
  xp = fish_common * 10 + fish_rare * 25 + fish_epic * 60 + fish_legendary * 150 + fish_mythic * 400
WHERE xp = 0;

UPDATE public.profiles SET level = public.level_for_xp(xp);
