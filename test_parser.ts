
import { parseJobDescription } from './lib/pricing/jobParser';

const description = "Clean 2 rooms";
const result = parseJobDescription(description);

console.log('Description:', description);
console.log('Primary Category:', result.primaryCategory);
console.log('Items:', JSON.stringify(result.items, null, 2));
console.log('Visits:', JSON.stringify(result.visits, null, 2));
