CREATE TABLE public.fish_species (
  id text PRIMARY KEY,
  name text NOT NULL,
  color text NOT NULL DEFAULT '#ffffff',
  rarity text,
  min_weight_kg numeric NOT NULL DEFAULT 1,
  max_weight_kg numeric NOT NULL DEFAULT 10,
  is_monster boolean NOT NULL DEFAULT false,
  base_price_per_kg numeric NOT NULL DEFAULT 1
);
CREATE TABLE public.rarity_base_weights (
  rarity text PRIMARY KEY,
  base_weight numeric NOT NULL
);
CREATE TABLE public.rod_tiers (
  id text PRIMARY KEY,
  name text NOT NULL,
  max_catch_weight_kg numeric NOT NULL
);
CREATE TABLE public.bait_tiers (
  id text PRIMARY KEY,
  name text NOT NULL,
  rarity_multiplier jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE TABLE public.weather_effects (
  weather_kind text PRIMARY KEY,
  bite_window_seconds numeric NOT NULL DEFAULT 1.6,
  rarity_multiplier jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE TABLE public.weather_cycle_config (
  id text PRIMARY KEY,
  change_interval_seconds numeric NOT NULL DEFAULT 240,
  weights jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE TABLE public.mutations (
  key text PRIMARY KEY,
  label text NOT NULL,
  multiplier numeric NOT NULL DEFAULT 1,
  drop_weight numeric NOT NULL DEFAULT 1
);
CREATE TABLE public.game_config (
  key text PRIMARY KEY,
  value numeric NOT NULL
);

GRANT SELECT ON public.fish_species, public.rarity_base_weights, public.rod_tiers,
  public.bait_tiers, public.weather_effects, public.weather_cycle_config,
  public.mutations, public.game_config TO anon, authenticated;
GRANT ALL ON public.fish_species, public.rarity_base_weights, public.rod_tiers,
  public.bait_tiers, public.weather_effects, public.weather_cycle_config,
  public.mutations, public.game_config TO service_role;

ALTER TABLE public.fish_species ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rarity_base_weights ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rod_tiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bait_tiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weather_effects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weather_cycle_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mutations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public read fish_species" ON public.fish_species FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "public read rarity_base_weights" ON public.rarity_base_weights FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "public read rod_tiers" ON public.rod_tiers FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "public read bait_tiers" ON public.bait_tiers FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "public read weather_effects" ON public.weather_effects FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "public read weather_cycle_config" ON public.weather_cycle_config FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "public read mutations" ON public.mutations FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "public read game_config" ON public.game_config FOR SELECT TO anon, authenticated USING (true);

CREATE TABLE public.profiles (
  wallet_address text PRIMARY KEY,
  username text NOT NULL UNIQUE,
  display_name text NOT NULL DEFAULT '',
  avatar_url text,
  level integer NOT NULL DEFAULT 1,
  coins numeric NOT NULL DEFAULT 0,
  fish_common integer NOT NULL DEFAULT 0,
  fish_rare integer NOT NULL DEFAULT 0,
  fish_epic integer NOT NULL DEFAULT 0,
  fish_legendary integer NOT NULL DEFAULT 0,
  fish_mythic integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX profiles_username_lower_idx ON public.profiles (lower(username));

CREATE TABLE public.fish_inventory_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address text NOT NULL REFERENCES public.profiles(wallet_address) ON DELETE CASCADE,
  species_id text NOT NULL,
  weight_kg numeric NOT NULL,
  mutation_key text NOT NULL DEFAULT 'none',
  caught_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX fish_inventory_wallet_idx ON public.fish_inventory_items (wallet_address, caught_at DESC);

GRANT ALL ON public.profiles TO service_role;
GRANT ALL ON public.fish_inventory_items TO service_role;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fish_inventory_items ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.record_catch(
  _wallet text, _rarity text, _species_id text, _weight_kg numeric, _mutation_key text
) RETURNS public.profiles
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE result public.profiles;
BEGIN
  INSERT INTO public.fish_inventory_items (wallet_address, species_id, weight_kg, mutation_key)
  VALUES (_wallet, _species_id, _weight_kg, coalesce(_mutation_key, 'none'));

  UPDATE public.profiles SET
    fish_common = fish_common + CASE WHEN _rarity = 'common' THEN 1 ELSE 0 END,
    fish_rare = fish_rare + CASE WHEN _rarity = 'rare' THEN 1 ELSE 0 END,
    fish_epic = fish_epic + CASE WHEN _rarity = 'epic' THEN 1 ELSE 0 END,
    fish_legendary = fish_legendary + CASE WHEN _rarity = 'legendary' THEN 1 ELSE 0 END,
    fish_mythic = fish_mythic + CASE WHEN _rarity = 'mythic' THEN 1 ELSE 0 END,
    updated_at = now()
  WHERE wallet_address = _wallet
  RETURNING * INTO result;

  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.sell_fish(
  _wallet text, _item_id uuid, _species_id text, _sell_all boolean
) RETURNS public.profiles
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE result public.profiles; payout numeric := 0;
BEGIN
  WITH sold AS (
    DELETE FROM public.fish_inventory_items i
    WHERE i.wallet_address = _wallet
      AND (
        coalesce(_sell_all, false)
        OR (_item_id IS NOT NULL AND i.id = _item_id)
        OR (_species_id IS NOT NULL AND i.species_id = _species_id)
      )
    RETURNING i.species_id, i.weight_kg, i.mutation_key
  )
  SELECT coalesce(sum(round(coalesce(s.base_price_per_kg, 0) * sold.weight_kg * coalesce(m.multiplier, 1))), 0)
  INTO payout
  FROM sold
  LEFT JOIN public.fish_species s ON s.id = sold.species_id
  LEFT JOIN public.mutations m ON m.key = sold.mutation_key;

  UPDATE public.profiles
  SET coins = coins + payout, updated_at = now()
  WHERE wallet_address = _wallet
  RETURNING * INTO result;

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.record_catch(text, text, text, numeric, text) FROM public;
REVOKE ALL ON FUNCTION public.sell_fish(text, uuid, text, boolean) FROM public;
GRANT EXECUTE ON FUNCTION public.record_catch(text, text, text, numeric, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.sell_fish(text, uuid, text, boolean) TO service_role;

INSERT INTO public.fish_species (id, name, color, rarity, min_weight_kg, max_weight_kg, is_monster, base_price_per_kg) VALUES
  ('clownfish','Clownfish','#f5a623','common',5,40,false,4),
  ('mackerel','Mackerel','#8fd0e8','rare',35,120,false,6),
  ('scad','Scad','#a7e0b0','epic',100,300,false,9),
  ('red_snapper','Red Snapper','#e8734a','legendary',280,650,false,14),
  ('baby_tuna','Baby Tuna','#5b7fa6','mythic',600,1300,false,22),
  ('ancient_leviathan','Ancient Leviathan','#1e46b4','mythic',1200,3000,true,40);

INSERT INTO public.rarity_base_weights (rarity, base_weight) VALUES
  ('common',100),('rare',45),('epic',18),('legendary',6),('mythic',2);

INSERT INTO public.rod_tiers (id, name, max_catch_weight_kg) VALUES
  ('common','Common Rod',100),('rare','Rare Rod',300),('epic','Epic Rod',600),
  ('legendary','Legendary Rod',1000),('mythic','Mythic Rod',2500);

INSERT INTO public.bait_tiers (id, name, rarity_multiplier) VALUES
  ('basic_bait','Basic Bait','{"common":1,"rare":1,"epic":1,"legendary":1,"mythic":1}'::jsonb);

INSERT INTO public.weather_effects (weather_kind, bite_window_seconds, rarity_multiplier) VALUES
  ('cerah',1.6,'{}'::jsonb),
  ('berawan',1.6,'{}'::jsonb),
  ('berkabut',1.3,'{"epic":1.3,"legendary":1.3,"mythic":1.3}'::jsonb),
  ('hujan',1.1,'{"epic":1.3,"legendary":1.5,"mythic":1.5}'::jsonb),
  ('badai',0.9,'{"legendary":1.8,"mythic":2.5}'::jsonb);

INSERT INTO public.weather_cycle_config (id, change_interval_seconds, weights) VALUES
  ('default',240,'{"cerah":40,"berawan":25,"berkabut":15,"hujan":12,"badai":8}'::jsonb);

INSERT INTO public.mutations (key, label, multiplier, drop_weight) VALUES
  ('none','Normal',1,55),('big','Big',1.2,15),('dark','Dark',1.3,10),
  ('albino','Albino',1.4,7),('sparkling','Sparkling',1.5,5);

INSERT INTO public.game_config (key, value) VALUES
  ('monster_catch_chance',0.02),('day_length_seconds',720);

CREATE POLICY "avatars readable" ON storage.objects FOR SELECT TO anon, authenticated
  USING (bucket_id = 'avatars');