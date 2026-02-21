
import { parseJobDescription } from './lib/pricing/jobParser';

const description = "Clean 2 rooms";
const result = parseJobDescription(description, [], []);

console.log('Description:', description);
console.log('Result:', JSON.stringify(result, null, 2));
