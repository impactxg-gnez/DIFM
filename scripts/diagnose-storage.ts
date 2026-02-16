import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
dotenv.config()

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

console.log('--- Env Check ---')
console.log('SUPABASE_URL:', supabaseUrl ? 'PRESENT' : 'MISSING')
console.log('SUPABASE_SERVICE_ROLE_KEY:', supabaseKey ? 'PRESENT' : 'MISSING')
console.log('DATABASE_URL:', process.env.DATABASE_URL ? 'PRESENT' : 'MISSING')

const supabase = createClient(supabaseUrl, supabaseKey)

async function testStorage() {
    console.log('\n--- Storage Check ---')
    try {
        const { data: buckets, error } = await supabase.storage.listBuckets()
        if (error) {
            console.error('Failed to list buckets:', error.message)
            return
        }
        console.log('Available buckets:', buckets.map(b => b.name))

        const scopeBucket = buckets.find(b => b.name === 'scope-photos')
        if (!scopeBucket) {
            console.error('scope-photos bucket MISSING')
        } else {
            console.log('scope-photos bucket FOUND')
        }
    } catch (err) {
        console.error('Storage test crashed:', err)
    }
}

testStorage()
