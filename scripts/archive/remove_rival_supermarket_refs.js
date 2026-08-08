/**
 * Cleanup (alcance estrecho): Remove rival supermarket references and the
 * SuKarne brand from the production DB.
 *
 * Scope (confirmed with user): ONLY rival supermarket chains
 * (Carnemart, Alsuper, Soriana, HEB, Walmart, Costco, Sam's, Smart)
 * plus the SuKarne brand. Other commercial brands (Lala, Bachoco,
 * Coca-Cola, etc.) are intentionally left untouched.
 *
 * Steps:
 *   1) Replace SuKarne brand in products (name/description/brand) -> 'Local'
 *   2) Strip rival-supermarket names from product tags
 *   3) Remove the "Carnemart" store and its product_stores entries
 *
 * Run: node scripts/remove_rival_supermarket_refs.js
 * Requires SUPABASE_SERVICE_ROLE_KEY in .env.local or env var.
 *
 * NOTE: The same cleanup is also available as a versioned SQL migration
 * (supabase/migrations/00020_remove_rival_supermarket_refs.sql), which is the
 * preferred path when the key is not available locally (e.g. "supabase db push"
 * or run it in the Supabase SQL editor).
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

// Brand to replace across product name/description/brand fields.
const BRAND_REPLACEMENTS = ['SuKarne'];
const REPLACEMENT = 'Local';

// Rival-supermarket keywords to strip from product tags arrays.
const TAG_KEYWORDS = [
  'carnemart', 'alsuper', 'soriana', 'heb', 'walmart', 'costco', 'sams', "sam's", 'smart',
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

// 1) Replace SuKarne brand references in products with "Local".
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

// 2) Strip rival-supermarket names from product tags.
async function cleanProductTags() {
  const { data: products, error } = await supabase
    .from('products')
    .select('id, name, tags');

  if (error) {
    console.error('Error fetching products for tag cleanup:', error.message);
    return;
  }

  console.log(`Scanning ${products.length} products for rival-supermarket tags...`);

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

// 3) Remove the "Carnemart" store and its product_stores entries.
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
  await runStep('1) Replace SuKarne brand references', updateBrandReferences);
  await runStep('2) Strip rival-supermarket tags', cleanProductTags);
  await runStep('3) Remove Carnemart store', removeCarnemartStore);

  console.log('\n✅ Cleanup script finished.');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
