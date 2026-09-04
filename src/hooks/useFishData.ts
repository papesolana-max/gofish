import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { getFishData as fetchFishData } from "@/lib/fishData.functions";
import { FALLBACK_FISH_DATA, setFishData, type FishData } from "@/lib/fishRules";

/** Loads the catch rules once and publishes them to the module-level snapshot
 *  the render loop reads from. Falls back to the seeded defaults on failure. */
export function useFishData() {
  const query = useQuery<FishData>({
    queryKey: ["fish-data"],
    queryFn: () => fetchFishData(),
    staleTime: Infinity,
    gcTime: Infinity,
    retry: 1,
  });

  useEffect(() => {
    if (query.data && query.data.species.length > 0) setFishData(query.data);
    else if (query.data || query.isError) setFishData(FALLBACK_FISH_DATA);
  }, [query.data, query.isError]);

  return query;
}
