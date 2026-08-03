-- Update category icons to use emoji icons instead of text identifiers
UPDATE categories SET icon = '🥬' WHERE slug = 'frutas-verduras';
UPDATE categories SET icon = '📦' WHERE slug = 'abarrotes';
UPDATE categories SET icon = '🧀' WHERE slug = 'lacteos-huevos';
UPDATE categories SET icon = '🥩' WHERE slug = 'carnes-aves-pescados';
UPDATE categories SET icon = '🍞' WHERE slug = 'panaderia-tortilleria';
UPDATE categories SET icon = '🥤' WHERE slug = 'bebidas';
UPDATE categories SET icon = '🍪' WHERE slug = 'botanas-dulces';
UPDATE categories SET icon = '🧹' WHERE slug = 'limpieza-cocina';
UPDATE categories SET icon = '❄️' WHERE slug = 'congelados';

-- Also handle the slug variants used in mock data
UPDATE categories SET icon = '🥬' WHERE slug = 'frutas-y-verduras';
UPDATE categories SET icon = '🥫' WHERE slug = 'despensa';
UPDATE categories SET icon = '🐾' WHERE slug = 'mascotas';
UPDATE categories SET icon = '🧹' WHERE slug = 'limpieza';
