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
export const IMG_COCA_COLA = "/images/products/144.png" // Coca Cola 2L
export const IMG_WATER = "/images/products/150.png"     // Agua Bonafont

// PANTRY — Alsuper local images
export const IMG_OIL = "/images/products/59.png"     // Aceite de Canola
export const IMG_BEANS = "/images/products/53.png"   // Frijol Pinto

// STORE BANNERS — using product images as store representations
export const STORE_BANNER_LA_COMER = "/images/products/1.png"
export const STORE_BANNER_SORIANA = "/images/products/4.png"
export const STORE_BANNER_WALMART = "/images/products/6.png"
export const STORE_BANNER_CHEDRAUI = "/images/products/12.png"
export const STORE_BANNER_FRESKO = "/images/products/16.png"
export const STORE_BANNER_CITY_MARKET = "/images/products/10.png"

// Product image map for easy lookup by product name
export const PRODUCT_IMAGES: Record<string, string> = {
  "Manzana Roja": IMG_APPLE,
  "Aguacate Hass": IMG_AVOCADO,
  "Leche Entera Lala 1L": IMG_MILK,
  "Pan Bimbo Blanco": IMG_BREAD,
  "Pechuga de Pollo": IMG_CHICKEN_BREAST,
  "Tortillas de Maíz": IMG_TORTILLAS,
  "Coca-Cola 2.5L": IMG_COCA_COLA,
  "Jitomate Saladet": IMG_TOMATO,
  "Huevo Blanco 18pz": IMG_EGGS,
  "Queso Oaxaca": IMG_CHEESE,
  "Aceite de Canola 1L": IMG_OIL,
  "Frijol Negro 1kg": IMG_BEANS,
  "Naranja Valencia": IMG_ORANGE,
  "Plátano Tabasco": IMG_BANANA,
  "Uvas Verdes": IMG_GRAPES,
  "Fresa": IMG_STRAWBERRY,
  "Papaya": IMG_PAPAYA,
  "Mango Ataúlfo": IMG_MANGO,
  "Sandía": IMG_WATERMELON,
  "Brócoli": IMG_BROCCOLI,
  "Zanahoria": IMG_CARROT,
  "Cebolla Blanca": IMG_ONION,
  "Papa Blanca": IMG_POTATO,
  "Lechuga Romana": IMG_LETTUCE,
  "Cilantro": IMG_CILANTRO,
  "Bistec de Res": IMG_BEEF_STEAK,
  "Carne Molida": IMG_GROUND_BEEF,
  "Chuleta de Cerdo": IMG_PORK,
  "Filete de Tilapia": IMG_FISH,
  "Yogurt Natural 1L": IMG_YOGURT,
  "Arroz 1kg": IMG_RICE,
  "Agua Bonafont 1.5L": IMG_WATER,
  "Pasta Spaghetti": IMG_PASTA,
}
