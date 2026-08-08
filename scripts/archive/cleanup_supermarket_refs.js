/**
 * Cleanup: Remove supermarket brand/store references, add is_visible column,
 * and create the collection_recipes table.
 *
 * Run: node scripts/cleanup_supermarket_refs.js
 * Requires SUPABASE_SERVICE_ROLE_KEY in .env.local or env var.
 *
 * NOTE: Steps 1 (add column) and 2 (create table) require running raw DDL.
 * Supabase's REST/JS client cannot execute arbitrary DDL directly, so this
 * script first tries an `exec_sql` RPC function (if one has been created in
 * the project, e.g. via `create or replace function exec_sql(sql text) ...`).
 * If that RPC is not available, the script prints the SQL so it can be run
 * manually in the Supabase SQL editor, then continues with the remaining
 * steps that ARE doable through the client (data updates/deletes).
 */
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  || process.env.SUPABASE_URL
  || 'https://isogthougrpctnfzcdes.supabase.co';

const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  || (() => {
    try {
      return fs.readFileSync('.env.local', 'utf8')
        .match(/SUPABASE_SERVICE_ROLE_KEY="([^"]+)"/)?.[1];
    } catch {
      return undefined;
    }
  })();

if (!key || key === '******' || key === '[SENSITIVE]') {
  console.error('ERROR: Could not read SUPABASE_SERVICE_ROLE_KEY.');
  console.error('Make sure your .env.local has the actual key (run: npx vercel env pull).');
  process.exit(1);
}

console.log('Targeting Supabase:', supabaseUrl);
const supabase = createClient(supabaseUrl, key, { auth: { persistSession: false } });

// Brands to replace across product name/description/brand fields.
const BRAND_REPLACEMENTS = [
  'Bachoco', 'SuKarne',
  'Lala', 'Nestlé', 'Nestle',
  'Heinz', "French's", 'French',
  'McCain',
  'Coca-Cola', 'Modelo',
  'Kraft', 'Del Monte',
  'Sigma', "Pilgrim's", 'Pilgrims', 'Bafar', 'Sysco', 'Chantilly', 'Puratos', 'Dawn', 'Toyo',
];
const REPLACEMENT = 'Resurte.me';

// Supermarket-related tag keywords to strip from product tags arrays.
const TAG_KEYWORDS = [
  'carnemart', 'soriana', 'heb', 'costco', 'sams', "sam's", 'walmart',
  'alsuper', 'smart', 'sigma', 'bachoco', 'pilgrim', 'pilgrims', 'sukarne',
  'bafar', 'sysco', 'nestle', 'nestlé', 'kraft', 'heinz', 'mccain',
  'french', 'lala', 'chantilly', 'puratos', 'dawn', 'toyo', 'delmonte',
  'del monte', 'cocacola', 'coca-cola', 'modelo',
];

const CARNEMART_STORE_ID = 2;

async function runStep(label, fn) {
  console.log(`\n=== ${label} ===`);
  try {
    await fn();
  } catch (err) {
    console.error(`❌ Error during "${label}":`, err.message || err);
  }
}

async function tryExecSql(sql, description) {
  const { error } = await supabase.rpc('exec_sql', { sql });
  if (error) {
    console.warn(`⚠ Could not run via exec_sql RPC (${description}): ${error.message}`);
    console.warn('   Run the following SQL manually in the Supabase SQL editor:');
    console.warn('   ----------------------------------------------------------');
    console.warn('  ', sql.replace(/\n/g, '\n   '));
    console.warn('   ----------------------------------------------------------');
    return false;
  }
  console.log(`✅ ${description}`);
  return true;
}

// 1) Add is_visible column to products table.
async function addIsVisibleColumn() {
  const sql = `
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS is_visible boolean NOT NULL DEFAULT true;
`.trim();
  await tryExecSql(sql, 'Added is_visible column to products');
}

// 2) Create collection_recipes table.
async function createCollectionRecipesTable() {
  const sql = `
CREATE TABLE IF NOT EXISTS collection_recipes (
  id serial PRIMARY KEY,
  collection_id integer REFERENCES restaurant_collections(id),
  name text,
  description text,
  ingredients text[],
  prep_time text,
  servings text,
  image_url text,
  display_order integer,
  is_active boolean NOT NULL DEFAULT true
);
`.trim();
  await tryExecSql(sql, 'Created collection_recipes table');
}

// 3) Replace supermarket brand references in products with "Resurte.me".
async function updateBrandReferences() {
  const { data: products, error } = await supabase
    .from('products')
    .select('id, name, description, brand');

  if (error) {
    console.error('Error fetching products:', error.message);
    return;
  }

  console.log(`Scanning ${products.length} products for brand references...`);

  const brandPattern = new RegExp(
    BRAND_REPLACEMENTS.map(b => b.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'),
    'gi'
  );

  let updatedCount = 0;

  for (const p of products) {
    const updates = {};

    if (typeof p.name === 'string' && brandPattern.test(p.name)) {
      updates.name = p.name.replace(brandPattern, REPLACEMENT);
    }
    brandPattern.lastIndex = 0;

    if (typeof p.description === 'string' && brandPattern.test(p.description)) {
      updates.description = p.description.replace(brandPattern, REPLACEMENT);
    }
    brandPattern.lastIndex = 0;

    if (typeof p.brand === 'string' && brandPattern.test(p.brand)) {
      updates.brand = REPLACEMENT;
    }
    brandPattern.lastIndex = 0;

    if (Object.keys(updates).length > 0) {
      console.log(`  Updating [${p.id}] ${p.name} ->`, updates);
      const { error: updErr } = await supabase
        .from('products')
        .update(updates)
        .eq('id', p.id);

      if (updErr) {
        console.error(`    ❌ ${updErr.message}`);
      } else {
        updatedCount++;
        console.log('    ✅ Done');
      }
    }
  }

  console.log(`\n✅ Brand references updated on ${updatedCount} products.`);
}

// 4) Strip supermarket names from product tags.
async function cleanProductTags() {
  const { data: products, error } = await supabase
    .from('products')
    .select('id, name, tags');

  if (error) {
    console.error('Error fetching products for tag cleanup:', error.message);
    return;
  }

  console.log(`Scanning ${products.length} products for supermarket tags...`);

  let cleanedCount = 0;

  for (const p of products) {
    if (!Array.isArray(p.tags) || p.tags.length === 0) continue;

    const filteredTags = p.tags.filter((tag) => {
      if (typeof tag !== 'string') return true;
      const lower = tag.toLowerCase();
      return !TAG_KEYWORDS.some((kw) => lower.includes(kw));
    });

    if (filteredTags.length !== p.tags.length) {
      console.log(`  Cleaning tags for [${p.id}] ${p.name}:`, p.tags, '->', filteredTags);
      const { error: updErr } = await supabase
        .from('products')
        .update({ tags: filteredTags })
        .eq('id', p.id);

      if (updErr) {
        console.error(`    ❌ ${updErr.message}`);
      } else {
        cleanedCount++;
        console.log('    ✅ Done');
      }
    }
  }

  console.log(`\n✅ Tags cleaned on ${cleanedCount} products.`);
}

// 5) Remove the "Carnemart" store and its product_stores entries.
async function removeCarnemartStore() {
  const { data: store, error: storeErr } = await supabase
    .from('stores')
    .select('id, name')
    .eq('id', CARNEMART_STORE_ID)
    .maybeSingle();

  if (storeErr) {
    console.error('Error fetching Carnemart store:', storeErr.message);
    return;
  }

  if (!store) {
    console.log(`No store found with id=${CARNEMART_STORE_ID}. Nothing to remove.`);
    return;
  }

  console.log(`Found store [${store.id}] "${store.name}". Removing product_stores entries...`);

  const { error: psErr, count } = await supabase
    .from('product_stores')
    .delete({ count: 'exact' })
    .eq('store_id', CARNEMART_STORE_ID);

  if (psErr) {
    console.error('Error deleting product_stores entries:', psErr.message);
    return;
  }
  console.log(`✅ Removed ${count ?? '?'} product_stores entries for store_id=${CARNEMART_STORE_ID}`);

  const { error: delStoreErr } = await supabase
    .from('stores')
    .delete()
    .eq('id', CARNEMART_STORE_ID);

  if (delStoreErr) {
    console.error('Error deleting Carnemart store:', delStoreErr.message);
    return;
  }

  console.log(`✅ Removed store [${CARNEMART_STORE_ID}] "${store.name}". Resurte.me is now the sole provider.`);
}

async function main() {
  await runStep('1) Add is_visible column to products', addIsVisibleColumn);
  await runStep('2) Create collection_recipes table', createCollectionRecipesTable);
  await runStep('3) Update supermarket brand references', updateBrandReferences);
  await runStep('4) Clean supermarket names from product tags', cleanProductTags);
  await runStep('5) Remove Carnemart store', removeCarnemartStore);

  console.log('\n✅ Cleanup script finished.');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
