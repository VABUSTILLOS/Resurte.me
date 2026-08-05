// Product images: resurte.me store images (GCS) for products sold in the store,
// Alsuper local images for generic fresh produce / packaged goods.
// Hero is a local produce market image.

// HERO
export const HERO_GROCERY = "/images/hero-grocery.webp"
export const HERO_FRUITS = "/images/hero-grocery.jpg"

// FRUITS — resurte.me store images
export const IMG_APPLE = "https://storage.googleapis.com/takeapp/media/cmihp02pp000604l43fzq2ed7.png"       // Manzana Roja
export const IMG_ORANGE = "https://storage.googleapis.com/takeapp/media/cmijnpm2z000904lbg1e59xve.png"      // Naranja Valencia
export const IMG_BANANA = "https://storage.googleapis.com/takeapp/media/cmijo779j000204jz2yrwe753.png"      // Plátano Chiapas
export const IMG_GRAPES = "https://storage.googleapis.com/takeapp/media/cmikmo2xq000304l8d0pmawqd.png"      // Uva Blanca
export const IMG_STRAWBERRY = "/images/products/8.webp"   // Fresa (Alsuper)
export const IMG_PAPAYA = "https://storage.googleapis.com/takeapp/media/cmijostxx001o04jv3tl8b2v9.png"     // Papaya Maradol
export const IMG_MANGO = "/images/products/10.webp"       // Mango Ataúlfo (Alsuper)
export const IMG_WATERMELON = "https://storage.googleapis.com/takeapp/media/cmijq38em001604l7hja83595.png" // Sandía

// VEGETABLES — resurte.me store images
export const IMG_AVOCADO = "https://storage.googleapis.com/takeapp/media/cmihon5gm000f04jo8q5f7jdf.png"     // Aguacate Hass
export const IMG_TOMATO = "https://storage.googleapis.com/takeapp/media/cmihqyxja000b04l5h1s4euob.png"     // Tomate Bola
export const IMG_BROCCOLI = "https://storage.googleapis.com/takeapp/media/cmihn1bq8000604l53jdqdh3t.png"   // Brócoli
export const IMG_CARROT = "https://storage.googleapis.com/takeapp/media/cmigh1lun000104lfbmdi5wgm.jpg"      // Zanahoria
export const IMG_ONION = "https://storage.googleapis.com/takeapp/media/cmihm7h13000104jsc7rz709l.png"       // Cebolla Blanca
export const IMG_POTATO = "https://storage.googleapis.com/takeapp/media/cmifgtjlp000b04l5a5r89mmc.jpg"      // Papa Morena
export const IMG_LETTUCE = "https://storage.googleapis.com/takeapp/media/cmiguf9xj000c04ih2kpi7szc.png"     // Lechuga Bola
export const IMG_CILANTRO = "https://storage.googleapis.com/takeapp/media/cmilwesph000704ikfang4orw.png"    // Cilantro

// MEATS & PROTEIN — Alsuper local images
export const IMG_CHICKEN_BREAST = "/images/products/105.webp"  // Pechuga de Pollo
export const IMG_BEEF_STEAK = "/images/products/111.webp"      // Milanesa de Res
export const IMG_PORK = "/images/products/119.webp"            // Chuleta de Cerdo
export const IMG_FISH = "/images/products/126.webp"            // Filete de Tilapia
export const IMG_GROUND_BEEF = "/images/products/112.webp"     // Carne Molida
export const IMG_EGGS = "https://storage.googleapis.com/takeapp/media/cmidk59fi00000imqacaggoal.webp"       // Huevo Blanco (store)

// DAIRY — mixed
export const IMG_MILK = "/images/products/90.webp"      // Leche Descremada (Alsuper)
export const IMG_CHEESE = "/images/products/97.webp"    // Queso Oaxaca (Alsuper)
export const IMG_YOGURT = "/images/products/102.webp"   // Yogurt Natural (Alsuper)
export const IMG_BUTTER = "https://storage.googleapis.com/takeapp/media/cmidk5ucg00000ijff55kb0k6.webp"     // Mantequilla sin Sal (store)

// BAKERY & GRAINS — mixed
export const IMG_BREAD = "/images/products/138.webp"     // Pan Hamburguesa (Alsuper)
export const IMG_TORTILLAS = "https://storage.googleapis.com/takeapp/media/cmidk5ovr00000hka85jr5bzf.webp" // Tortillas de Harina (store)
export const IMG_RICE = "/images/products/51.webp"       // Arroz Blanco (Alsuper)
export const IMG_PASTA = "/images/products/64.webp"      // Pasta Spaghetti (Alsuper)

// BEVERAGES — Alsuper local images
export const IMG_COCA_COLA = "https://storage.googleapis.com/takeapp/media/cmidk5hmj00000if2e2qc0ads.webp" // Coca Cola 2.5L (store)
export const IMG_WATER = "/images/products/150.webp"     // Agua Bonafont

// PANTRY — Alsuper local images
export const IMG_OIL = "/images/products/59.webp"     // Aceite de Canola
export const IMG_BEANS = "/images/products/53.webp"   // Frijol Negro

// STORE BANNERS — using product images as store representations
export const STORE_BANNER_LA_COMER = "/images/products/1.webp"
export const STORE_BANNER_SORIANA = "/images/products/4.webp"
export const STORE_BANNER_WALMART = "/images/products/6.webp"
export const STORE_BANNER_CHEDRAUI = "/images/products/12.webp"
export const STORE_BANNER_FRESKO = "/images/products/16.webp"
export const STORE_BANNER_CITY_MARKET = "/images/products/10.webp"

// Product image map for easy lookup by product name
export const PRODUCT_IMAGES: Record<string, string> = {
  // Fruits & Vegetables (GCS store images)
  "Manzana Roja": IMG_APPLE,
  "Aguacate Hass": IMG_AVOCADO,
  "Naranja Valencia": IMG_ORANGE,
  "Plátano Tabasco": IMG_BANANA,
  "Uvas Verdes": IMG_GRAPES,
  "Papaya Maradol": IMG_PAPAYA,
  "Sandía": IMG_WATERMELON,
  "Jitomate Saladet": IMG_TOMATO,
  "Brócoli": IMG_BROCCOLI,
  "Zanahoria": IMG_CARROT,
  "Cebolla Blanca": IMG_ONION,
  "Papa Blanca": IMG_POTATO,
  "Lechuga Romana": IMG_LETTUCE,
  "Cilantro": IMG_CILANTRO,
  // Fruits & Vegetables (local images)
  "Plátano Macho": "/images/products/7.webp",
  "Fresa": "/images/products/8.webp",
  "Mango Ataúlfo": "/images/products/10.webp",
  "Epazote": "/images/products/34.webp",
  "Hongo Portobello": "/images/products/49.webp",
  "Champiñón": "/images/products/50.webp",
  // Grains & Pantry (local images)
  "Arroz Blanco 1kg": "/images/products/51.webp",
  "Arroz Blanco 5kg": "/images/products/52.webp",
  "Frijol Negro 1kg": "/images/products/53.webp",
  "Frijol Negro 5kg": "/images/products/54.webp",
  "Frijol Bayo 1kg": "/images/products/55.webp",
  "Frijol Peruano 1kg": "/images/products/56.webp",
  "Lenteja 1kg": "/images/products/57.webp",
  "Aceite de Canola 1L": "/images/products/59.webp",
  "Aceite de Canola 5L": "/images/products/60.webp",
  "Aceite de Maíz 1L": "/images/products/61.webp",
  "Pasta Spaghetti 500g": "/images/products/64.webp",
  "Harina de Trigo 1kg": "/images/products/68.webp",
  "Sal de Mar Fina 1kg": "/images/products/71.webp",
  "Sal Gruesa 1kg": "/images/products/72.webp",
  "Orégano Molido 100g": "/images/products/75.webp",
  "Salsa Maggi 200ml": "/images/products/77.webp",
  "Catsup 1kg": "/images/products/80.webp",
  "Mayonesa 1kg": "/images/products/81.webp",
  "Consomé de Pollo 1kg": "/images/products/83.webp",
  "Vinagre Blanco 1L": "/images/products/85.webp",
  // Dairy & Eggs (local images)
  "Leche Descremada 1L": "/images/products/90.webp",
  "Leche Evaporada 360ml": "/images/products/91.webp",
  "Media Crema 240ml": "/images/products/92.webp",
  "Leche Condensada 370ml": "/images/products/93.webp",
  "Huevo Rojo 18pz": "/images/products/96.webp",
  "Queso Oaxaca 400g": "/images/products/97.webp",
  "Queso Fresco 500g": "/images/products/98.webp",
  "Queso Panela 400g": "/images/products/99.webp",
  "Queso Manchego 400g": "/images/products/100.webp",
  "Yogurt Natural 1L": "/images/products/102.webp",
  // Meats & Protein (local images)
  "Pechuga de Pollo": "/images/products/105.webp",
  "Milanesa de Pollo": "/images/products/106.webp",
  "Pierna y Muslo de Pollo": "/images/products/107.webp",
  "Alitas de Pollo": "/images/products/108.webp",
  "Milanesa de Res": "/images/products/111.webp",
  "Carne Molida 80/20": "/images/products/112.webp",
  "Diezmillo de Res": "/images/products/113.webp",
  "Arrachera": "/images/products/116.webp",
  "Ribeye": "/images/products/117.webp",
  "T-Bone": "/images/products/118.webp",
  "Chuleta de Cerdo": "/images/products/119.webp",
  "Lomo de Cerdo": "/images/products/120.webp",
  "Costilla de Cerdo": "/images/products/121.webp",
  "Tocino": "/images/products/122.webp",
  "Jamón de Pierna": "/images/products/123.webp",
  "Chorizo": "/images/products/124.webp",
  // Seafood (local images)
  "Filete de Tilapia": "/images/products/126.webp",
  "Filete de Basa": "/images/products/127.webp",
  "Camarón Pacotilla": "/images/products/128.webp",
  "Camarón U12-U15": "/images/products/129.webp",
  "Pulpo": "/images/products/130.webp",
  "Mojarra Entera": "/images/products/131.webp",
  "Huachinango Entero": "/images/products/132.webp",
  "Camarón Seco": "/images/products/133.webp",
  "Salmón": "/images/products/134.webp",
  // Bakery (local images)
  "Pan para Hot Dog": "/images/products/137.webp",
  "Pan para Hamburguesa": "/images/products/138.webp",
  // Beverages (local images)
  "Sprite 2L": "/images/products/147.webp",
  "Sidral Mundet 2L": "/images/products/149.webp",
  "Agua Bonafont 1.5L": "/images/products/150.webp",
  "Agua Mineral 1.5L": "/images/products/151.webp",
  "Agua Mineral Saborizada 1.5L": "/images/products/152.webp",
  // Beverages (GCS store images)
  "Coca-Cola 2.5L": IMG_COCA_COLA,
  // Snacks (local images)
  "Sabritas Clásicas 170g": "/images/products/160.webp",
  "Cacahuate Salado 200g": "/images/products/162.webp",
  "Galletas Marías 200g": "/images/products/163.webp",
  "Galletas Saladas 200g": "/images/products/164.webp",
  // Cleaning (local images)
  "Detergente Líquido 1L": "/images/products/169.webp",
  "Detergente en Polvo 1kg": "/images/products/170.webp",
  "Limpiador Multiusos 500ml": "/images/products/172.webp",
  "Limpiavidrios 500ml": "/images/products/173.webp",
  "Fibras para Trastes 3pz": "/images/products/175.webp",
  "Servilletas 100pz": "/images/products/177.webp",
  "Papel de Cocina 2pz": "/images/products/178.webp",
  // Frozen (local images)
  "Helado Vainilla 1L": "/images/products/182.webp",
  "Paletas de Hielo 12pz": "/images/products/183.webp",
  "Filete de Tilapia Congelado 1kg": "/images/products/184.webp",
  "Camarón Congelado 1kg": "/images/products/185.webp",
  "Nuggets de Pollo 1kg": "/images/products/186.webp",
  // Legacy GCS/other references
  "Leche Entera Lala 1L": IMG_MILK,
  "Pan Bimbo Blanco": IMG_BREAD,
  "Tortillas de Maíz": IMG_TORTILLAS,
  "Huevo Blanco 18pz": IMG_EGGS,
  "Papaya": IMG_PAPAYA,
  "Bistec de Res": IMG_BEEF_STEAK,
  "Carne Molida": IMG_GROUND_BEEF,
  "Arroz 1kg": IMG_RICE,
  "Pasta Spaghetti": IMG_PASTA,
}
