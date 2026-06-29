import { supabase } from "@/lib/supabase";
import type { TeamMember } from "@/lib/types";

type TeamMemberRow = {
  id: string;
  slug: string;
  display_name: string;
  is_admin: boolean;
};

export async function loadTeamMembers(): Promise<TeamMember[]> {
  const { data, error } = await supabase
    .from("team_members")
    .select("id, slug, display_name, is_admin")
    .order("sort_order");

  if (error || !data) return [];

  return (data as TeamMemberRow[]).map((row) => ({
    id: row.id,
    slug: row.slug,
    name: row.display_name,
    isAdmin: row.is_admin,
  }));
}
