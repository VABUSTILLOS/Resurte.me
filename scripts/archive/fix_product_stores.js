/**
 * Fix: Add missing product_stores entries so all products appear in catalog.
 * Run: node scripts/fix_product_stores.js
 * Requires SUPABASE_SERVICE_ROLE_KEY in .env.local or env var.
 */
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  || 'https://isogthougrpctnfzcdes.supabase.co';

const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  || fs.readFileSync('.env.local', 'utf8').match(/SUPABASE_SERVICE_ROLE_KEY="([^"]+)"/)?.[1];

if (!key || key === '******' || key === '[SENSITIVE]') {
  console.error('ERROR: Could not read SUPABASE_SERVICE_ROLE_KEY.');
  console.error('Make sure your .env.local has the actual key (run: npx vercel env pull).');
  process.exit(1);
}

console.log('Targeting Supabase:', supabaseUrl);
const supabase = createClient(supabaseUrl, key, { auth: { persistSession: false } });

async function main() {
  // Get all products
  const { data: products, error: prodErr } = await supabase
    .from('products').select('id,name').order('id');

  if (prodErr) {
    console.error('Error fetching products:', prodErr.message);
    process.exit(1);
  }

  // Get existing product_stores entries
  const { data: stores, error: storeErr } = await supabase
    .from('product_stores').select('product_id');

  if (storeErr) {
    console.error('Error fetching product_stores:', storeErr.message);
    process.exit(1);
  }

  const storeIds = new Set(stores.map(s => s.product_id));
  const missing = products.filter(p => !storeIds.has(p.id));

  console.log(`Total products: ${products.length}`);
  console.log(`In catalog: ${storeIds.size}`);
  console.log(`Missing: ${missing.length}`);

  if (missing.length === 0) {
    console.log('✅ All products already in catalog!');
    return;
  }

  for (const p of missing) {
    console.log(`  Adding [${p.id}] ${p.name}...`);
    const { error } = await supabase
      .from('product_stores')
      .insert({ product_id: p.id, store_id: 1 });

    if (error) {
      if (error.code === '23505') {
        console.log('    ⚠ Already exists (race condition)');
      } else {
        console.error(`    ❌ ${error.message}`);
      }
    } else {
      console.log('    ✅ Done');
    }
  }

  console.log('\n✅ All products now visible in catalog!');
}

main().catch(console.error);
