import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { RemoteImage } from '@/components/ui/RemoteImage';

export interface Visit {
  visit_id: string;
  item_class: 'STANDARD' | 'CLEANING' | 'SPECIALIST';
  visit_type_label: string;
  primary_job_item: {
    job_item_id: string;
    display_name: string;
    time_weight_minutes: number;
    classification_id?: string;
  };
  addon_job_items: {
    job_item_id: string;
    display_name: string;
    time_weight_minutes: number;
    classification_id?: string;
  }[];
  required_capability_tags: string[];
  total_minutes: number;
  tier: 'H1' | 'H2' | 'H3';
  price: number;
  display_price?: number | null;
  scope_photos?: string;
  parts_photos?: string;
  parts_status?: string;
  parts_breakdown?: any;
  parts_notes?: string;
  /** From quote / scope lock — drives pre-lock clarifier UI */
  clarifiers?: Array<{
    id: string;
    question: string;
    inputType?: string;
    required?: boolean;
    options?: string[];
    affects_time?: boolean;
    affects_safety?: boolean;
    clarifier_type?: string;
    capability_tag?: string;
  }>;
  detected_tasks?: string[];
}

export function VisitCard({ visit, index }: { visit: Visit; index: number }) {
  const allJobNames = [
    visit.primary_job_item.display_name,
    ...visit.addon_job_items.map((a) => a.display_name),
  ].filter(Boolean);
  const jobSummary = allJobNames.length <= 2
    ? allJobNames.join(' + ')
    : `${allJobNames.length} Tasks`;

  const displayPrice = Number(visit.display_price);
  const hasDisplayPrice = Number.isFinite(displayPrice);
  if (!hasDisplayPrice) {
    console.error('Missing backend display_price', visit);
  }

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
            <div className="text-sm font-semibold text-white">{jobSummary}</div>
            <div className="text-sm text-gray-300">
              <div>
                • {visit.primary_job_item.display_name}
                {visit.primary_job_item.classification_id ? (
                  <span className="block text-xs text-gray-500 mt-0.5 font-normal">
                    Class: {visit.primary_job_item.classification_id.replace(/_/g, ' ')}
                  </span>
                ) : null}
              </div>
              {visit.addon_job_items.map((a) => (
                <div key={a.job_item_id}>
                  • {a.display_name}
                  {a.classification_id ? (
                    <span className="block text-xs text-gray-500 mt-0.5 font-normal">
                      Class: {a.classification_id.replace(/_/g, ' ')}
                    </span>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
          <div className="text-right shrink-0">
            {hasDisplayPrice ? (
              <div className="text-lg font-black text-white">£{displayPrice.toFixed(2)}</div>
            ) : null}
            <div className="text-xs text-gray-500">{visit.total_minutes} min</div>
          </div>
        </div>

        {/* Photo Gallery */}
        {(visit.scope_photos || visit.parts_photos) && (
          <div className="flex gap-2 overflow-x-auto pb-2 border-t border-white/5 pt-4">
            {visit.scope_photos?.split(',').map((url, i) => (
              <div key={`scope-${i}`} className="space-y-1">
                <RemoteImage
                  path={url}
                  bucket="SCOPE"
                  className="w-20 h-20 object-cover rounded border border-white/10"
                />
                <p className="text-[8px] text-gray-500 text-center uppercase font-bold">Scope</p>
              </div>
            ))}
            {visit.parts_photos?.split(',').map((url, i) => (
              <div key={`parts-${i}`} className="space-y-1">
                <RemoteImage
                  path={url}
                  bucket="PART"
                  className="w-20 h-20 object-cover rounded border border-white/10"
                />
                <p className="text-[8px] text-gray-500 text-center uppercase font-bold">Part</p>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}


