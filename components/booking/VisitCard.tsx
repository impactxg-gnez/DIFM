import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export interface Visit {
  visit_id: string;
  item_class: 'STANDARD' | 'CLEANING' | 'SPECIALIST';
  visit_type_label: string;
  primary_job_item: {
    job_item_id: string;
    display_name: string;
    time_weight_minutes: number;
  };
  addon_job_items: {
    job_item_id: string;
    display_name: string;
    time_weight_minutes: number;
  }[];
  required_capability_tags: string[];
  total_minutes: number;
  tier: 'H1' | 'H2' | 'H3';
  price: number;
}

export function VisitCard({ visit, index }: { visit: Visit; index: number }) {
  return (
    <Card className="bg-[#1E1E20] border-white/10 text-white">
      <CardContent className="p-5 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="bg-blue-500/10 text-blue-400 border-blue-500/20 font-mono">
                Visit {index + 1} — {visit.visit_type_label}
              </Badge>
              <Badge variant="outline" className="bg-indigo-500/10 text-indigo-400 border-indigo-500/20 font-mono">
                {visit.item_class}
              </Badge>
              <Badge variant="outline" className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 font-mono">
                Tier: {visit.tier}
              </Badge>
            </div>
            <div className="text-sm text-gray-300">
              <div>• {visit.primary_job_item.display_name}</div>
              {visit.addon_job_items.map((a) => (
                <div key={a.job_item_id}>• {a.display_name}</div>
              ))}
            </div>
          </div>
          <div className="text-right shrink-0">
            <div className="text-lg font-black text-white">£{Number(visit.price || 0).toFixed(2)}</div>
            <div className="text-xs text-gray-500">{visit.total_minutes} min</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}


