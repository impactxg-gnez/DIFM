import type { MatrixV2JobRow, MatrixV2Model } from './types';

/** Priced via HANDYMAN minute ladder; `qty` scales room count (“paint 3 rooms”). */
const ROOM_PAINTING: MatrixV2JobRow = {
    job_item_id: 'room_painting',
    category: 'PAINTER',
    base_tier: 'H2',
    min_minutes: 100,
    max_minutes: 130,
    clarifierIds: [],
    quantity_threshold: 12,
};

const SYNTH_PHRASES = [
    'paint bedroom',
    'paint bedrooms',
    'paint a bedroom',
    'paint my bedroom',
    'paint room',
    'paint rooms',
    'paint a room',
    'paint the room',
    'paint hall',
    'paint hallway',
    'paint lounge',
    'paint living room',
    'paint kitchen',
    'paint office',
    'paint study',
    'paint landing',
    'paint flat',
    'paint apartment',
    'interior painting',
    'walls painting',
    'wall painting',
    'paint walls',
    'repaint walls',
    'repaint bedroom',
    'repaint room',
    'painting bedroom',
    'painting room',
    'paint 2 rooms',
    'paint 3 rooms',
    'paint 4 rooms',
    'painting 2 rooms',
];

export function applySyntheticResidentialPaintingToModel(model: MatrixV2Model): void {
    if (model.jobs.has('room_painting')) return;

    model.jobs.set('room_painting', ROOM_PAINTING);

    const existing = new Set(model.phrases.map((p) => `${p.phrase.toLowerCase().trim()}::${p.job_item_id}`));
    for (const phrase of SYNTH_PHRASES) {
        const key = `${phrase.toLowerCase().trim()}::room_painting`;
        if (existing.has(key)) continue;
        existing.add(key);
        model.phrases.push({ phrase, job_item_id: 'room_painting' });
    }
}
