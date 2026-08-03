// Product images: resurte.me store images (GCS) for products sold in the store,
// Alsuper local images for generic fresh produce / packaged goods.
// Hero is a local produce market image.

// HERO
export const HERO_GROCERY = "/images/hero-grocery.jpg"
export const HERO_FRUITS = "/images/hero-grocery.jpg"

// FRUITS — resurte.me store images
export const IMG_APPLE = "https://storage.googleapis.com/takeapp/media/cmihp02pp000604l43fzq2ed7.png"       // Manzana Roja
export const IMG_ORANGE = "https://storage.googleapis.com/takeapp/media/cmijnpm2z000904lbg1e59xve.png"      // Naranja Valencia
export const IMG_BANANA = "https://storage.googleapis.com/takeapp/media/cmijo779j000204jz2yrwe753.png"      // Plátano Chiapas
export const IMG_GRAPES = "https://storage.googleapis.com/takeapp/media/cmikmo2xq000304l8d0pmawqd.png"      // Uva Blanca
export const IMG_STRAWBERRY = "/images/products/8.png"   // Fresa (Alsuper)
export const IMG_PAPAYA = "https://storage.googleapis.com/takeapp/media/cmijostxx001o04jv3tl8b2v9.png"     // Papaya Maradol
export const IMG_MANGO = "/images/products/10.png"       // Mango Ataúlfo (Alsuper)
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
export const IMG_CHICKEN_BREAST = "/images/products/105.png"  // Pechuga de Pollo
export const IMG_BEEF_STEAK = "/images/products/111.png"      // Milanesa de Res
export const IMG_PORK = "/images/products/119.png"            // Chuleta de Cerdo
export const IMG_FISH = "/images/products/126.png"            // Filete de Tilapia
export const IMG_GROUND_BEEF = "/images/products/112.png"     // Carne Molida
export const IMG_EGGS = "https://storage.googleapis.com/takeapp/media/cmidk59fi00000imqacaggoal.webp"       // Huevo Blanco (store)

// DAIRY — mixed
export const IMG_MILK = "/images/products/90.png"      // Leche Descremada (Alsuper)
export const IMG_CHEESE = "/images/products/97.png"    // Queso Oaxaca (Alsuper)
export const IMG_YOGURT = "/images/products/102.png"   // Yogurt Natural (Alsuper)
export const IMG_BUTTER = "https://storage.googleapis.com/takeapp/media/cmidk5ucg00000ijff55kb0k6.webp"     // Mantequilla sin Sal (store)

// BAKERY & GRAINS — mixed
export const IMG_BREAD = "/images/products/138.png"     // Pan Hamburguesa (Alsuper)
export const IMG_TORTILLAS = "https://storage.googleapis.com/takeapp/media/cmidk5ovr00000hka85jr5bzf.webp" // Tortillas de Harina (store)
export const IMG_RICE = "/images/products/51.png"       // Arroz Blanco (Alsuper)
export const IMG_PASTA = "/images/products/64.png"      // Pasta Spaghetti (Alsuper)

// BEVERAGES — Alsuper local images
export const IMG_COCA_COLA = "https://storage.googleapis.com/takeapp/media/cmidk5hmj00000if2e2qc0ads.webp" // Coca Cola 2.5L (store)
export const IMG_WATER = "/images/products/150.png"     // Agua Bonafont

// PANTRY — Alsuper local images
export const IMG_OIL = "/images/products/59.png"     // Aceite de Canola
export const IMG_BEANS = "/images/products/53.png"   // Frijol Negro

// STORE BANNERS — using product images as store representations
export const STORE_BANNER_LA_COMER = "/images/products/1.png"
export const STORE_BANNER_SORIANA = "/images/products/4.png"
export const STORE_BANNER_WALMART = "/images/products/6.png"
export const STORE_BANNER_CHEDRAUI = "/images/products/12.png"
export const STORE_BANNER_FRESKO = "/images/products/16.png"
export const STORE_BANNER_CITY_MARKET = "/images/products/10.png"

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
  "Plátano Macho": "/images/products/7.png",
  "Fresa": "/images/products/8.png",
  "Mango Ataúlfo": "/images/products/10.png",
  "Epazote": "/images/products/34.png",
  "Hongo Portobello": "/images/products/49.png",
  "Champiñón": "/images/products/50.png",
  // Grains & Pantry (local images)
  "Arroz Blanco 1kg": "/images/products/51.png",
  "Arroz Blanco 5kg": "/images/products/52.png",
  "Frijol Negro 1kg": "/images/products/53.png",
  "Frijol Negro 5kg": "/images/products/54.png",
  "Frijol Bayo 1kg": "/images/products/55.png",
  "Frijol Peruano 1kg": "/images/products/56.png",
  "Lenteja 1kg": "/images/products/57.png",
  "Aceite de Canola 1L": "/images/products/59.png",
  "Aceite de Canola 5L": "/images/products/60.png",
  "Aceite de Maíz 1L": "/images/products/61.png",
  "Pasta Spaghetti 500g": "/images/products/64.png",
  "Harina de Trigo 1kg": "/images/products/68.png",
  "Sal de Mar Fina 1kg": "/images/products/71.png",
  "Sal Gruesa 1kg": "/images/products/72.png",
  "Orégano Molido 100g": "/images/products/75.png",
  "Salsa Maggi 200ml": "/images/products/77.png",
  "Catsup 1kg": "/images/products/80.png",
  "Mayonesa 1kg": "/images/products/81.png",
  "Consomé de Pollo 1kg": "/images/products/83.png",
  "Vinagre Blanco 1L": "/images/products/85.png",
  // Dairy & Eggs (local images)
  "Leche Descremada 1L": "/images/products/90.png",
  "Leche Evaporada 360ml": "/images/products/91.png",
  "Media Crema 240ml": "/images/products/92.png",
  "Leche Condensada 370ml": "/images/products/93.png",
  "Huevo Rojo 18pz": "/images/products/96.png",
  "Queso Oaxaca 400g": "/images/products/97.png",
  "Queso Fresco 500g": "/images/products/98.png",
  "Queso Panela 400g": "/images/products/99.png",
  "Queso Manchego 400g": "/images/products/100.png",
  "Yogurt Natural 1L": "/images/products/102.png",
  // Meats & Protein (local images)
  "Pechuga de Pollo": "/images/products/105.png",
  "Milanesa de Pollo": "/images/products/106.png",
  "Pierna y Muslo de Pollo": "/images/products/107.png",
  "Alitas de Pollo": "/images/products/108.png",
  "Milanesa de Res": "/images/products/111.png",
  "Carne Molida 80/20": "/images/products/112.png",
  "Diezmillo de Res": "/images/products/113.png",
  "Arrachera": "/images/products/116.png",
  "Ribeye": "/images/products/117.png",
  "T-Bone": "/images/products/118.png",
  "Chuleta de Cerdo": "/images/products/119.png",
  "Lomo de Cerdo": "/images/products/120.png",
  "Costilla de Cerdo": "/images/products/121.png",
  "Tocino": "/images/products/122.png",
  "Jamón de Pierna": "/images/products/123.png",
  "Chorizo": "/images/products/124.png",
  // Seafood (local images)
  "Filete de Tilapia": "/images/products/126.png",
  "Filete de Basa": "/images/products/127.png",
  "Camarón Pacotilla": "/images/products/128.png",
  "Camarón U12-U15": "/images/products/129.png",
  "Pulpo": "/images/products/130.png",
  "Mojarra Entera": "/images/products/131.png",
  "Huachinango Entero": "/images/products/132.png",
  "Camarón Seco": "/images/products/133.png",
  "Salmón": "/images/products/134.png",
  // Bakery (local images)
  "Pan para Hot Dog": "/images/products/137.png",
  "Pan para Hamburguesa": "/images/products/138.png",
  // Beverages (local images)
  "Sprite 2L": "/images/products/147.png",
  "Sidral Mundet 2L": "/images/products/149.png",
  "Agua Bonafont 1.5L": "/images/products/150.png",
  "Agua Mineral 1.5L": "/images/products/151.png",
  "Agua Mineral Saborizada 1.5L": "/images/products/152.png",
  // Beverages (GCS store images)
  "Coca-Cola 2.5L": IMG_COCA_COLA,
  // Snacks (local images)
  "Sabritas Clásicas 170g": "/images/products/160.png",
  "Cacahuate Salado 200g": "/images/products/162.png",
  "Galletas Marías 200g": "/images/products/163.png",
  "Galletas Saladas 200g": "/images/products/164.png",
  // Cleaning (local images)
  "Detergente Líquido 1L": "/images/products/169.png",
  "Detergente en Polvo 1kg": "/images/products/170.png",
  "Limpiador Multiusos 500ml": "/images/products/172.png",
  "Limpiavidrios 500ml": "/images/products/173.png",
  "Fibras para Trastes 3pz": "/images/products/175.png",
  "Servilletas 100pz": "/images/products/177.png",
  "Papel de Cocina 2pz": "/images/products/178.png",
  // Frozen (local images)
  "Helado Vainilla 1L": "/images/products/182.png",
  "Paletas de Hielo 12pz": "/images/products/183.png",
  "Filete de Tilapia Congelado 1kg": "/images/products/184.png",
  "Camarón Congelado 1kg": "/images/products/185.png",
  "Nuggets de Pollo 1kg": "/images/products/186.png",
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
