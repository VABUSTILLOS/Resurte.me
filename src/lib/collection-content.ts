/**
 * Collection Content — Narrativas premium por tipo de colección.
 *
 * Cada colección es un homenaje a su gastronomía. Este archivo contiene
 * los copys, historias y valores que visten cada página de colección
 * para dueños de restaurante que buscan insumos de calidad institucional.
 */

export interface CollectionStory {
  /** Título decorativo tipo "Nuestra Herencia" */
  title: string
  /** Texto narrativo que enaltece la tradición culinaria */
  body: string
  /** URL de imagen decorativa para la sección (opcional, usa la de la colección si no) */
  imageUrl?: string
}

export interface CollectionValue {
  /** Título del valor (ej: "Lo que hace un buen taco") */
  title: string
  /** Descripción que enaltece este aspecto de la cocina */
  description: string
  /** ícono emoji o lucide name */
  icon: string
  /** Imagen de fondo o decorativa */
  imageUrl?: string
}

export interface CollectionContent {
  /** Hero subtitle — frase poética debajo del nombre de la colección */
  heroTagline: string
  /** Sección narrativa "Nuestra Historia" */
  story: CollectionStory
  /** 3 valores que se intercalan con el catálogo de productos */
  values: [CollectionValue, CollectionValue, CollectionValue]
}

const COLLECTION_CONTENT: Record<string, CollectionContent> = {
  // ── Taquerías & Antojitos ──────────────────────────────────────
  taquerias: {
    heroTagline: "Donde el maíz se vuelve arte y la salsa, carácter.",
    story: {
      title: "El alma de la taquería",
      body: "La taquería mexicana no es un negocio: es un templo. Cada tortilla que sale del comal, cada trompo que gira frente al carbón, cada salsa que se muele en molcajete lleva siglos de historia. Desde los mercados prehispánicos hasta las taquerías contemporáneas, el taco ha sido el lenguaje común de un país que se entiende a través de sus sabores. Proveer a una taquería es honrar esa herencia — es asegurarse de que cada ingrediente esté a la altura de la tradición que representa.",
    },
    values: [
      {
        title: "Lo que hace un buen taco",
        description: "No es la proteína. No es la salsa. Es la tortilla. Una tortilla de maíz nixtamalizado, recién hecha, es la diferencia entre un taco memorable y uno olvidable. Por eso curamos las mejores harinas, masas y tortillas para que tu taquería empiece con el pie derecho — o mejor dicho, con la tortilla correcta.",
        icon: "🌽",
      },
      {
        title: "La salsa: firma del taquero",
        description: "Cada taquero tiene su salsa secreta. La que hace que los clientes regresen. Pero una gran salsa empieza con grandes chiles, jitomates maduros y especias frescas. Nuestra selección de insumos para salsas está pensada para que tu firma sepa exactamente como quieres que sepa — intensa, equilibrada, inolvidable.",
        icon: "🌶️",
      },
      {
        title: "El ritual del trompo",
        description: "Pastor, árabe, de bistec — el trompo es el corazón visual de la taquería. Pero un gran trompo necesita grandes cortes, marinados con tiempo y sazón. Nuestros proveedores entienden el volumen y la calidad que una taquería exige. Porque cuando el trompo gira, todo lo demás se detiene.",
        icon: "🔥",
      },
    ],
  },

  "taquerias-antojitos": {
    heroTagline: "Donde el maíz se vuelve arte y la salsa, carácter.",
    story: {
      title: "El alma de la taquería",
      body: "La taquería mexicana no es un negocio: es un templo. Cada tortilla que sale del comal, cada trompo que gira frente al carbón, cada salsa que se muele en molcajete lleva siglos de historia. Desde los mercados prehispánicos hasta las taquerías contemporáneas, el taco ha sido el lenguaje común de un país que se entiende a través de sus sabores. Proveer a una taquería es honrar esa herencia — es asegurarse de que cada ingrediente esté a la altura de la tradición que representa.",
    },
    values: [
      {
        title: "Lo que hace un buen taco",
        description: "No es la proteína. No es la salsa. Es la tortilla. Una tortilla de maíz nixtamalizado, recién hecha, es la diferencia entre un taco memorable y uno olvidable. Por eso curamos las mejores harinas, masas y tortillas para que tu taquería empiece con el pie derecho — o mejor dicho, con la tortilla correcta.",
        icon: "🌽",
      },
      {
        title: "La salsa: firma del taquero",
        description: "Cada taquero tiene su salsa secreta. La que hace que los clientes regresen. Pero una gran salsa empieza con grandes chiles, jitomates maduros y especias frescas. Nuestra selección de insumos para salsas está pensada para que tu firma sepa exactamente como quieres que sepa — intensa, equilibrada, inolvidable.",
        icon: "🌶️",
      },
      {
        title: "El ritual del trompo",
        description: "Pastor, árabe, de bistec — el trompo es el corazón visual de la taquería. Pero un gran trompo necesita grandes cortes, marinados con tiempo y sazón. Nuestros proveedores entienden el volumen y la calidad que una taquería exige. Porque cuando el trompo gira, todo lo demás se detiene.",
        icon: "🔥",
      },
    ],
  },

  // ── Hamburgueserías ─────────────────────────────────────────────
  hamburgueserias: {
    heroTagline: "Entre panes artesanales y cortes que se respetan.",
    story: {
      title: "Más que fast food: un oficio",
      body: "La hamburguesería contemporánea ha elevado lo que antes era comida rápida a un arte culinario. El smash burger perfecto, la blend de cortes premium, el pan brioche que se tuesta en mantequilla — cada detalle importa. Detrás de cada hamburguesería exitosa hay un dueño que entiende que la calidad de los insumos es lo que separa una hamburguesa del montón de una que los clientes recuerdan. Nosotros existimos para que nunca tengas que sacrificar calidad por volumen.",
    },
    values: [
      {
        title: "La carne: el protagonista",
        description: "Un blend bien balanceado — chuck, brisket, short rib — es lo que define el carácter de tu hamburguesa. Trabajamos con cortes seleccionados para que cada mordida tenga el porcentaje exacto de grasa, la textura correcta y el sabor que hace que tus clientes pidan otra.",
        icon: "🥩",
      },
      {
        title: "El pan que lo sostiene todo",
        description: "Un pan que se desmorona arruina la mejor carne. Pan brioche, potato bun, artesanal — cada estilo tiene su momento. Nuestra selección de panes está pensada para hamburgueserías que entienden que el pan no es un accesorio: es la estructura.",
        icon: "🍞",
      },
      {
        title: "Toppings con personalidad",
        description: "Queso americano que se derrite como debe, pepinillos crujientes, tocino ahumado, cebolla caramelizada. Los toppings son la firma de tu hamburguesería. Curamos cada ingrediente para que tu hamburguesa cuente una historia completa desde el primer hasta el último bocado.",
        icon: "🧀",
      },
    ],
  },

  "hamburguesas-hot-dogs": {
    heroTagline: "Entre panes artesanales y cortes que se respetan.",
    story: {
      title: "Más que fast food: un oficio",
      body: "La hamburguesería contemporánea ha elevado lo que antes era comida rápida a un arte culinario. El smash burger perfecto, la blend de cortes premium, el pan brioche que se tuesta en mantequilla — cada detalle importa. Detrás de cada hamburguesería exitosa hay un dueño que entiende que la calidad de los insumos es lo que separa una hamburguesa del montón de una que los clientes recuerdan. Nosotros existimos para que nunca tengas que sacrificar calidad por volumen.",
    },
    values: [
      {
        title: "La carne: el protagonista",
        description: "Un blend bien balanceado — chuck, brisket, short rib — es lo que define el carácter de tu hamburguesa. Trabajamos con cortes seleccionados para que cada mordida tenga el porcentaje exacto de grasa, la textura correcta y el sabor que hace que tus clientes pidan otra.",
        icon: "🥩",
      },
      {
        title: "El pan que lo sostiene todo",
        description: "Un pan que se desmorona arruina la mejor carne. Pan brioche, potato bun, artesanal — cada estilo tiene su momento. Nuestra selección de panes está pensada para hamburgueserías que entienden que el pan no es un accesorio: es la estructura.",
        icon: "🍞",
      },
      {
        title: "Toppings con personalidad",
        description: "Queso americano que se derrite como debe, pepinillos crujientes, tocino ahumado, cebolla caramelizada. Los toppings son la firma de tu hamburguesería. Curamos cada ingrediente para que tu hamburguesa cuente una historia completa desde el primer hasta el último bocado.",
        icon: "🧀",
      },
    ],
  },

  // ── Sushi & Cocina Asiática ────────────────────────────────────
  sushi: {
    heroTagline: "La precisión japonesa encuentra los ingredientes que merece.",
    story: {
      title: "El camino del arroz",
      body: "En la cocina japonesa, el arroz no es una guarnición: es el plato. El sushi es, ante todo, arroz — sazonado con vinagre, azúcar y sal en la proporción exacta que cada itamae guarda como un secreto. Sobre esa cama de arroz perfecto descansa el pescado más fresco, las verduras más crujientes, las algas más puras. Abastecer a una cocina asiática es entender que cada ingrediente tiene un propósito, una técnica, un respeto. Desde el salmón grado sashimi hasta la soya fermentada, cada insumo cuenta.",
    },
    values: [
      {
        title: "El pescado: frescura sin concesiones",
        description: "Salmón, atún, hamachi — el sushi vive y muere por la frescura de su pescado. Nuestra cadena de frío y nuestros proveedores garantizan que cada corte llegue con el color, la textura y la temperatura exacta que un restaurante japonés exige. Porque el sushi no perdona.",
        icon: "🐟",
      },
      {
        title: "Arroz y vinagre: la base invisible",
        description: "El arroz para sushi no es cualquier arroz. Es un grano corto, de almidón preciso, que se sazona con vinagre de arroz auténtico. Proveemos arroz grado sushi y vinagres importados para que tu cocina tenga la base que la tradición japonesa merece.",
        icon: "🍚",
      },
      {
        title: "Salsas y acompañamientos",
        description: "Soya, wasabi, jengibre encurtido, sriracha, aceite de ajonjolí — los acompañamientos son el marco que realza la obra. Seleccionamos cada salsa y condimento para que el sabor de tu cocina asiática sea tan auténtico como el de una barra en Tokio.",
        icon: "🥢",
      },
    ],
  },

  "sushi-comida-asiatica": {
    heroTagline: "La precisión japonesa encuentra los ingredientes que merece.",
    story: {
      title: "El camino del arroz",
      body: "En la cocina japonesa, el arroz no es una guarnición: es el plato. El sushi es, ante todo, arroz — sazonado con vinagre, azúcar y sal en la proporción exacta que cada itamae guarda como un secreto. Sobre esa cama de arroz perfecto descansa el pescado más fresco, las verduras más crujientes, las algas más puras. Abastecer a una cocina asiática es entender que cada ingrediente tiene un propósito, una técnica, un respeto. Desde el salmón grado sashimi hasta la soya fermentada, cada insumo cuenta.",
    },
    values: [
      {
        title: "El pescado: frescura sin concesiones",
        description: "Salmón, atún, hamachi — el sushi vive y muere por la frescura de su pescado. Nuestra cadena de frío y nuestros proveedores garantizan que cada corte llegue con el color, la textura y la temperatura exacta que un restaurante japonés exige. Porque el sushi no perdona.",
        icon: "🐟",
      },
      {
        title: "Arroz y vinagre: la base invisible",
        description: "El arroz para sushi no es cualquier arroz. Es un grano corto, de almidón preciso, que se sazona con vinagre de arroz auténtico. Proveemos arroz grado sushi y vinagres importados para que tu cocina tenga la base que la tradición japonesa merece.",
        icon: "🍚",
      },
      {
        title: "Salsas y acompañamientos",
        description: "Soya, wasabi, jengibre encurtido, sriracha, aceite de ajonjolí — los acompañamientos son el marco que realza la obra. Seleccionamos cada salsa y condimento para que el sabor de tu cocina asiática sea tan auténtico como el de una barra en Tokio.",
        icon: "🥢",
      },
    ],
  },

  // ── Pizzería ────────────────────────────────────────────────────
  pizzeria: {
    heroTagline: "Donde la harina, el fuego y el tiempo hacen la magia.",
    story: {
      title: "El horno no miente",
      body: "La pizza es democracia culinaria: un disco de masa que acepta cualquier ingrediente pero exige respeto absoluto por la técnica. Harina doble cero, levadura viva, fermentación lenta, San Marzano, mozzarella di bufala — cada elemento tiene su razón de ser. Una pizzería no vive de la cobertura, vive de la masa. Y una gran masa empieza con grandes insumos. Desde la harina italiana hasta el pepperoni americano, nosotros aseguramos que tu horno siempre tenga lo mejor para trabajar.",
    },
    values: [
      {
        title: "La masa: ciencia y paciencia",
        description: "Harina de fuerza, hidratación precisa, fermentación en frío. La masa de pizza es un acto de fe que se prueba en cada servicio. Proveemos harinas italianas, levaduras y mejoradores para que tu masa tenga la elasticidad, el alveolado y el sabor que define a una gran pizzería.",
        icon: "🍞",
      },
      {
        title: "Salsa y queso: el alma italiana",
        description: "Tomates San Marzano, mozzarella fresca, parmigiano reggiano. La cobertura clásica no admite atajos. Nuestra selección de lácteos y conservas italianas está pensada para pizzerías que honran la tradición napolitana sin concesiones.",
        icon: "🧀",
      },
      {
        title: "Los toppings que cuentan historias",
        description: "Pepperoni ahumado, champiñones frescos, aceitunas, anchoas, prosciutto. Cada topping es una oportunidad de diferenciarte. Curamos ingredientes que resisten el horno sin perder carácter, para que cada rebanada sea exactamente como la imaginaste.",
        icon: "🍕",
      },
    ],
  },

  "pizzas-comida-italiana": {
    heroTagline: "Donde la harina, el fuego y el tiempo hacen la magia.",
    story: {
      title: "El horno no miente",
      body: "La pizza es democracia culinaria: un disco de masa que acepta cualquier ingrediente pero exige respeto absoluto por la técnica. Harina doble cero, levadura viva, fermentación lenta, San Marzano, mozzarella di bufala — cada elemento tiene su razón de ser. Una pizzería no vive de la cobertura, vive de la masa. Y una gran masa empieza con grandes insumos. Desde la harina italiana hasta el pepperoni americano, nosotros aseguramos que tu horno siempre tenga lo mejor para trabajar.",
    },
    values: [
      {
        title: "La masa: ciencia y paciencia",
        description: "Harina de fuerza, hidratación precisa, fermentación en frío. La masa de pizza es un acto de fe que se prueba en cada servicio. Proveemos harinas italianas, levaduras y mejoradores para que tu masa tenga la elasticidad, el alveolado y el sabor que define a una gran pizzería.",
        icon: "🍞",
      },
      {
        title: "Salsa y queso: el alma italiana",
        description: "Tomates San Marzano, mozzarella fresca, parmigiano reggiano. La cobertura clásica no admite atajos. Nuestra selección de lácteos y conservas italianas está pensada para pizzerías que honran la tradición napolitana sin concesiones.",
        icon: "🧀",
      },
      {
        title: "Los toppings que cuentan historias",
        description: "Pepperoni ahumado, champiñones frescos, aceitunas, anchoas, prosciutto. Cada topping es una oportunidad de diferenciarte. Curamos ingredientes que resisten el horno sin perder carácter, para que cada rebanada sea exactamente como la imaginaste.",
        icon: "🍕",
      },
    ],
  },

  // ── Cafetería ───────────────────────────────────────────────────
  cafeteria: {
    heroTagline: "El arte del grano, desde la finca hasta tu taza.",
    story: {
      title: "La pausa que vale",
      body: "Una cafetería no vende café: vende momentos. Ese primer sorbo de la mañana, la conversación que se alarga, la laptop y el espresso, el capuchino que se vuelve ritual. Detrás de cada taza hay una cadena de decisiones — el origen del grano, el tueste exacto, la molienda precisa, la leche vaporizada a la temperatura correcta. Cada eslabón importa. Nuestros insumos para cafetería están seleccionados para que cada taza que sirvas honre ese momento.",
    },
    values: [
      {
        title: "El grano: origen y tueste",
        description: "Arábica de altura, tueste medio, frescura absoluta. Proveemos café en grano de fincas mexicanas seleccionadas para que tu espresso tenga cuerpo, acidez balanceada y un perfil de sabor que tus clientes reconozcan y recuerden.",
        icon: "☕",
      },
      {
        title: "Leche y alternativas",
        description: "Leche entera para capuchinos sedosos, leches vegetales para todos los gustos. La textura de la leche vaporizada es el 80% de un buen latte. Nuestras leches y alternativas están pensadas para baristas que exigen microespuma perfecta.",
        icon: "🥛",
      },
      {
        title: "Desechables con clase",
        description: "Vasos kraft, tapas ajustadas, agitadores de madera, servilletas que no se deshacen. El servicio para llevar debe sentirse tan premium como quedarse. Curamos desechables que protegen tu café y tu marca.",
        icon: "🥤",
      },
    ],
  },

  "cafeterias-crepas-desayunos": {
    heroTagline: "El arte del grano, desde la finca hasta tu taza.",
    story: {
      title: "La pausa que vale",
      body: "Una cafetería no vende café: vende momentos. Ese primer sorbo de la mañana, la conversación que se alarga, la laptop y el espresso, el capuchino que se vuelve ritual. Detrás de cada taza hay una cadena de decisiones — el origen del grano, el tueste exacto, la molienda precisa, la leche vaporizada a la temperatura correcta. Cada eslabón importa. Nuestros insumos para cafetería están seleccionados para que cada taza que sirvas honre ese momento.",
    },
    values: [
      {
        title: "El grano: origen y tueste",
        description: "Arábica de altura, tueste medio, frescura absoluta. Proveemos café en grano de fincas mexicanas seleccionadas para que tu espresso tenga cuerpo, acidez balanceada y un perfil de sabor que tus clientes reconozcan y recuerden.",
        icon: "☕",
      },
      {
        title: "Leche y alternativas",
        description: "Leche entera para capuchinos sedosos, leches vegetales para todos los gustos. La textura de la leche vaporizada es el 80% de un buen latte. Nuestras leches y alternativas están pensadas para baristas que exigen microespuma perfecta.",
        icon: "🥛",
      },
      {
        title: "Desechables con clase",
        description: "Vasos kraft, tapas ajustadas, agitadores de madera, servilletas que no se deshacen. El servicio para llevar debe sentirse tan premium como quedarse. Curamos desechables que protegen tu café y tu marca.",
        icon: "🥤",
      },
    ],
  },

  // ── Marisquerías ────────────────────────────────────────────────
  marisquerias: {
    heroTagline: "Del mar a tu cocina, con la frescura que el sabor exige.",
    story: {
      title: "El mar no espera",
      body: "La marisquería mexicana es un patrimonio. Desde los cócteles de campechana en la costa hasta los tacos de pescado estilo Ensenada, pasando por los aguachiles de Sinaloa y los pescados a la talla del Pacífico. Cada región tiene su forma de honrar el mar, pero todas coinciden en una cosa: el producto manda. Un camarón que no está fresco, un pescado que perdió la cadena de frío, un callo de hacha que viajó de más — eso no se arregla con limón. Por eso nuestra logística está diseñada para que el mar llegue intacto a tu cocina.",
    },
    values: [
      {
        title: "Frescura certificada",
        description: "Camarón, pescado, pulpo, callo — cada especie tiene su temperatura, su manejo, su urgencia. Nuestra cadena de frío está calibrada para que los productos del mar lleguen como recién salidos del agua. Sin olores, sin texturas comprometidas.",
        icon: "🦐",
      },
      {
        title: "Congelados que respetan",
        description: "El congelado bien hecho conserva mejor que el 'fresco' mal manejado. Filetes IQF, camarones limpios, pescados procesados en origen. Proveemos congelados de calidad institucional para que tu carta no dependa de la temporada.",
        icon: "🧊",
      },
      {
        title: "Salsas y acompañantes marinos",
        description: "Salsa huichol, chamoy, catsup, salsa inglesa, jugo de limón — los acompañantes hacen el coctel. Seleccionamos salsas y condimentos pensados para realzar el sabor del mar sin opacarlo.",
        icon: "🍋",
      },
    ],
  },

  "mariscos-pescados": {
    heroTagline: "Del mar a tu cocina, con la frescura que el sabor exige.",
    story: {
      title: "El mar no espera",
      body: "La marisquería mexicana es un patrimonio. Desde los cócteles de campechana en la costa hasta los tacos de pescado estilo Ensenada, pasando por los aguachiles de Sinaloa y los pescados a la talla del Pacífico. Cada región tiene su forma de honrar el mar, pero todas coinciden en una cosa: el producto manda. Un camarón que no está fresco, un pescado que perdió la cadena de frío, un callo de hacha que viajó de más — eso no se arregla con limón. Por eso nuestra logística está diseñada para que el mar llegue intacto a tu cocina.",
    },
    values: [
      {
        title: "Frescura certificada",
        description: "Camarón, pescado, pulpo, callo — cada especie tiene su temperatura, su manejo, su urgencia. Nuestra cadena de frío está calibrada para que los productos del mar lleguen como recién salidos del agua. Sin olores, sin texturas comprometidas.",
        icon: "🦐",
      },
      {
        title: "Congelados que respetan",
        description: "El congelado bien hecho conserva mejor que el 'fresco' mal manejado. Filetes IQF, camarones limpios, pescados procesados en origen. Proveemos congelados de calidad institucional para que tu carta no dependa de la temporada.",
        icon: "🧊",
      },
      {
        title: "Salsas y acompañantes marinos",
        description: "Salsa huichol, chamoy, catsup, salsa inglesa, jugo de limón — los acompañantes hacen el coctel. Seleccionamos salsas y condimentos pensados para realzar el sabor del mar sin opacarlo.",
        icon: "🍋",
      },
    ],
  },

  // ── Fondas & Comida Mexicana ────────────────────────────────────
  fondas: {
    heroTagline: "La cocina mexicana de todos los días, hecha con lo mejor.",
    story: {
      title: "El sazón que no se improvisa",
      body: "La fonda es el corazón de la gastronomía mexicana. Es el lugar donde el arroz rojo sabe a casa, donde los frijoles huelen a epazote, donde el guisado del día reconforta el alma. No hay alta cocina sin cocina de fondo, y no hay cocina de fondo sin buenos insumos. Desde el aceite donde se fríen las tortillas hasta la sal de grano que sazona los frijoles, cada ingrediente importa. Porque la comida corrida no es comida rápida: es comida honesta, hecha con tiempo y con producto.",
    },
    values: [
      {
        title: "La despensa de la abuela",
        description: "Arroz, frijol, lenteja, haba — las legumbres y granos que sostienen la cocina mexicana. Proveemos granos seleccionados por bulto para que tu fonda siempre tenga la base lista. Porque sin un buen frijol no hay un buen día.",
        icon: "🫘",
      },
      {
        title: "Guisos con fundamento",
        description: "Aceite vegetal, manteca, especias molidas, chiles secos, jitomate en lata. Cada guisado empieza en la despensa correcta. Nuestra selección de abarrotes está pensada para fondas que cocinan por volumen sin perder el sabor casero.",
        icon: "🍲",
      },
      {
        title: "Tortillas y pan: la mesa puesta",
        description: "Tortillas de maíz por kilo, bolillo fresco, teleras para torta. La mesa mexicana no está completa sin tortillas calientes. Aseguramos el abasto diario de tortillería y panadería para que nunca falte lo esencial.",
        icon: "🫓",
      },
    ],
  },

  "comida-mexicana-corrida": {
    heroTagline: "La cocina mexicana de todos los días, hecha con lo mejor.",
    story: {
      title: "El sazón que no se improvisa",
      body: "La fonda es el corazón de la gastronomía mexicana. Es el lugar donde el arroz rojo sabe a casa, donde los frijoles huelen a epazote, donde el guisado del día reconforta el alma. No hay alta cocina sin cocina de fondo, y no hay cocina de fondo sin buenos insumos. Desde el aceite donde se fríen las tortillas hasta la sal de grano que sazona los frijoles, cada ingrediente importa. Porque la comida corrida no es comida rápida: es comida honesta, hecha con tiempo y con producto.",
    },
    values: [
      {
        title: "La despensa de la abuela",
        description: "Arroz, frijol, lenteja, haba — las legumbres y granos que sostienen la cocina mexicana. Proveemos granos seleccionados por bulto para que tu fonda siempre tenga la base lista. Porque sin un buen frijol no hay un buen día.",
        icon: "🫘",
      },
      {
        title: "Guisos con fundamento",
        description: "Aceite vegetal, manteca, especias molidas, chiles secos, jitomate en lata. Cada guisado empieza en la despensa correcta. Nuestra selección de abarrotes está pensada para fondas que cocinan por volumen sin perder el sabor casero.",
        icon: "🍲",
      },
      {
        title: "Tortillas y pan: la mesa puesta",
        description: "Tortillas de maíz por kilo, bolillo fresco, teleras para torta. La mesa mexicana no está completa sin tortillas calientes. Aseguramos el abasto diario de tortillería y panadería para que nunca falte lo esencial.",
        icon: "🫓",
      },
    ],
  },

  // ── Cortes & Asaderos ───────────────────────────────────────────
  "cortes-carne-asaderos": {
    heroTagline: "El fuego y la carne: un lenguaje universal.",
    story: {
      title: "Donde el carbón encuentra su propósito",
      body: "El asador mexicano es un lugar de encuentro. Es el aroma a carbón encendido, el sonido de la carne al contacto con la parrilla, la paciencia de quien sabe que un buen corte no se apura. Desde los asaderos de Sonora hasta las parrillas urbanas, la cultura de la carne en México es profunda, diversa y exigente. Un rib eye mal marmoleado, un vacío sin sello, un carbón que no da la temperatura — eso se nota. Nuestros cortes están seleccionados para asaderos que entienden que la carne se respeta.",
    },
    values: [
      {
        title: "Cortes premium para parrilla",
        description: "Rib eye, picanha, vacío, arrachera, tomahawk — cada corte tiene su punto, su tiempo, su técnica. Proveemos carne de res seleccionada para que tu parrilla siempre tenga el protagonista correcto, con el marmoleo y la textura que tus comensales esperan.",
        icon: "🥩",
      },
      {
        title: "Carbón y fuego: los silenciosos protagonistas",
        description: "Carbón vegetal de mezquite o encino, leña para ahumar — el combustible define el sabor. Un buen carbón arde parejo, mantiene temperatura y aporta ese aroma que ningún sartén puede replicar. Proveemos carbón de calidad para asaderos serios.",
        icon: "🔥",
      },
      {
        title: "Guarniciones con carácter",
        description: "Papas para asar, cebollas cambray, chiles toreados, tortillas de harina, salsas. La parrillada no es solo carne: es el ritual completo. Seleccionamos guarniciones que acompañan tus cortes sin robarles protagonismo.",
        icon: "🧅",
      },
    ],
  },

  // ── Pollo & Alitas ──────────────────────────────────────────────
  "pollo-alitas": {
    heroTagline: "Crujientes, jugosas, inolvidables.",
    story: {
      title: "El pollo que levanta el vuelo",
      body: "Las alitas no son un antojo: son una industria. Desde el restaurante especializado en wings hasta la cocina que fríe pollo para todo el barrio, el pollo frito y las alitas representan uno de los segmentos más dinámicos de la gastronomía. Pero una gran alita no se improvisa: necesita un pollo de calidad, una cobertura que cruja, un aceite limpio y una salsa que enganche. Cada eslabón de esa cadena importa, y nosotros nos aseguramos de que todos estén cubiertos.",
    },
    values: [
      {
        title: "Pollo de calidad institucional",
        description: "Alitas frescas, boneless, muslos — por caja, por kilo, a la escala que tu negocio necesita. Trabajamos con piezas seleccionadas para que cada pieza sea consistente en tamaño, textura y sabor. Porque un ala chica es una decepción.",
        icon: "🍗",
      },
      {
        title: "Coberturas y rebozadores",
        description: "Harina para freír, panko, breading sazonado — la cobertura es lo que cruje. Nuestros rebozadores están formulados para que el pollo quede crujiente por fuera y jugoso por dentro, aguantando incluso bajo lámparas de calor.",
        icon: "🧂",
      },
      {
        title: "Salsas: el arsenal del wingman",
        description: "Buffalo, BBQ, mango-habanero, ranch, blue cheese — una barra de salsas completa es lo que fideliza. Proveemos salsas concentradas y bases para que tu carta de alitas tenga la variedad que tus clientes esperan.",
        icon: "🍯",
      },
    ],
  },

  // ── Saludable ────────────────────────────────────────────────────
  "saludable-ensaladas-pokes": {
    heroTagline: "Lo fresco también puede ser contundente.",
    story: {
      title: "Comer limpio no es comer aburrido",
      body: "El movimiento saludable no es una moda: es una evolución. Ensaladas que son plato fuerte, pokes que compiten con cualquier comida, bowls que equilibran proteína, grasa buena y carbohidratos complejos. Pero servir comida saludable a escala requiere insumos que duren, que sepan y que nutran. Desde las lechugas hidropónicas hasta las semillas, desde el salmón para poke hasta los aderezos sin conservadores — cada ingrediente de tu cocina saludable debe estar a la altura de la promesa que le haces a tus clientes.",
    },
    values: [
      {
        title: "Verdes que sí saben",
        description: "Lechuga hidropónica, espinaca baby, kale, arúgula, mix primavera — hojas frescas que aguantan en cámara y se ven bien en el plato. Proveemos vegetales de hoja seleccionados para cocinas saludables de alto volumen.",
        icon: "🥬",
      },
      {
        title: "Proteínas limpias",
        description: "Pechuga de pollo orgánica, salmón para poke, tofu, edamame, atún. La proteína es el ancla del bowl. Nuestras opciones están pensadas para menús saludables que no sacrifican sabor por nutrición.",
        icon: "🥗",
      },
      {
        title: "Semillas, frutos y toppings",
        description: "Ajonjolí, chía, almendra, arándano, quinoa — los toppings son textura, color y nutrientes. Seleccionamos semillas y frutos secos a granel para que tus bowls siempre tengan ese crunch que los hace irresistibles.",
        icon: "🥜",
      },
    ],
  },

  // ── Postres & Panadería ─────────────────────────────────────────
  "postres-panaderia-helados": {
    heroTagline: "El dulce final que define la experiencia.",
    story: {
      title: "Donde la repostería se vuelve precisión",
      body: "La panadería y la repostería son el punto dulce entre la ciencia y el arte. Gramos exactos, temperaturas precisas, fermentaciones controladas — y al mismo tiempo, creatividad, presentación, sorpresa. Un croissant perfecto, un pastel que se deshace, un helado que sabe a lo que promete: nada de eso sucede sin los mejores insumos. Harinas de fuerza, chocolates de cobertura, esencias puras, frutos para hornear. Cada gramo cuenta cuando el resultado se mide en sonrisas.",
    },
    values: [
      {
        title: "Harinas y masas madre",
        description: "Harina de fuerza, harina para repostería, masa madre, levadura fresca. La base de toda panadería está en el amasijo. Proveemos harinas seleccionadas para que tu pan tenga la miga, la corteza y el sabor que tus clientes buscan cada mañana.",
        icon: "🌾",
      },
      {
        title: "Chocolate y coberturas",
        description: "Chocolate belga, chocolate mexicano, cocoa, coberturas blancas y oscuras. El chocolate es el protagonista de la repostería fina. Nuestra selección de chocolates está curada para pastelerías que no aceptan sucedáneos.",
        icon: "🍫",
      },
      {
        title: "Bases, esencias y frutos",
        description: "Esencia de vainilla pura, pasta de almendras, frutos rojos congelados, bases para helado. Los detalles hacen la diferencia entre un postre correcto y uno memorable. Proveemos insumos de repostería profesional para que cada creación sea irrepetible.",
        icon: "🍰",
      },
    ],
  },

  // ── Comida Árabe & Griega ───────────────────────────────────────
  "comida-arabe-griega": {
    heroTagline: "Especias que cruzan desiertos y tradiciones milenarias.",
    story: {
      title: "Sabores que vienen de lejos",
      body: "La cocina árabe y mediterránea es una de las más antiguas del mundo. Cada especia, cada técnica, cada combinación de sabores lleva consigo rutas de comercio, historias de migración y siglos de perfeccionamiento. El tahini que emulsiona el hummus, el za'atar que perfuma el pan pita, el cordero especiado que se deshace en el plato — todo eso requiere insumos fieles a su origen. Porque un shawarma no es cualquier trompo, y un falafel no es cualquier croqueta.",
    },
    values: [
      {
        title: "Pan pita y envolturas",
        description: "Pan pita fresco, tortillas de harina para kebab, pan para shawarma. El pan es la herramienta principal de esta cocina: envuelve, acompaña, recoge. Proveemos panes y envolturas para que cada bocado tenga estructura.",
        icon: "🫓",
      },
      {
        title: "Especias y condimentos",
        description: "Za'atar, zumaque, comino, cardamomo, canela, cúrcuma, baharat, ras el hanout. Las especias son el alma de la cocina árabe. Nuestra selección de especias puras y blends está pensada para cocinas que entienden que el sabor se construye por capas.",
        icon: "🧂",
      },
      {
        title: "Tahini, hummus y salsas",
        description: "Tahini de ajonjolí, garbanzo seco, yogur griego, aceite de oliva, zumo de limón. Los clásicos de la mesa árabe requieren ingredientes puros y bien procesados. Proveemos las bases para que tus mezze brillen por sí mismos.",
        icon: "🫙",
      },
    ],
  },

  // ── Comida Venezolana & Latina ──────────────────────────────────
  "comida-venezolana-latina": {
    heroTagline: "El sabor que cruza fronteras y une mesas.",
    story: {
      title: "Harina PAN y corazón",
      body: "La cocina latinoamericana es un mosaico de influencias indígenas, africanas y europeas. Desde las arepas venezolanas hasta las empanadas argentinas, desde los tacos mexicanos hasta las pupusas salvadoreñas — cada bocado cuenta una historia de mestizaje, migración y orgullo. Pero hay un ingrediente que une a toda Latinoamérica: el maíz. Harina PAN, masa de maíz, plátano macho, queso costeño — estos insumos son identidad. Y merecen ser tratados con el respeto que su historia demanda.",
    },
    values: [
      {
        title: "Harina PAN y masas",
        description: "Harina de maíz precocida, masa para arepas, harina para cachapas, harina para empanadas. La arepa no existe sin su harina. Proveemos harinas venezolanas y colombianas auténticas para que tu cocina latina sea tan real como la de una casa en Caracas.",
        icon: "🌽",
      },
      {
        title: "Plátano y yuca",
        description: "Plátano macho maduro y verde, yuca fresca, ñame. Los acompañamientos fritos y hervidos son imprescindibles en la mesa latina. Nuestros proveedores garantizan plátano en su punto exacto para tostones, patacones y tajadas.",
        icon: "🍌",
      },
      {
        title: "Quesos y proteínas latinas",
        description: "Queso costeño, queso llanero, queso fresco, carne mechada, chorizo latino. Los rellenos y acompañamientos son los que llenan el plato de sabor. Seleccionamos quesos y proteínas que aguantan el volumen sin perder la esencia artesanal.",
        icon: "🧀",
      },
    ],
  },

  // ── Bebidas & Bares ─────────────────────────────────────────────
  "bebidas-bares-botanas": {
    heroTagline: "Lo que se sirve entre copas también merece calidad.",
    story: {
      title: "La barra es el escenario",
      body: "Un bar no solo vende bebidas: vende atmósfera. Es el lugar donde se brinda, se celebra, se conoce gente. Pero detrás de cada cerveza bien servida, de cada coctel perfectamente balanceado, de cada botana que acompaña la charla, hay una operación que no puede fallar. Hielo, refrescos, cervezas, limones, sales, escarchados, cacahuates, papas — cada insumo parece menor, pero su ausencia se nota al instante. Una barra desabastecida es una experiencia incompleta.",
    },
    values: [
      {
        title: "Cervezas y refrescos",
        description: "Cerveza nacional e importada, refrescos en botella de vidrio, aguas minerales, tónicas. La carta de bebidas define el carácter de tu bar. Proveemos bebidas frías por caja con precios institucionales para que tu barra nunca se quede seca.",
        icon: "🍺",
      },
      {
        title: "Botanas y snacks",
        description: "Cacahuates, papas fritas, chicharrones, palomitas, aceitunas, frutos secos. Una buena botana invita a quedarse una ronda más. Nuestra selección de snacks está pensada para bares que saben que el detalle hace la cuenta.",
        icon: "🥜",
      },
      {
        title: "Insumos de barra",
        description: "Limón, sal, hielo, popotes, servilletas, vasos. La coctelería básica depende de insumos que parecen menores pero son críticos. Aseguramos el abasto constante de los esenciales de barra para que nunca te tome por sorpresa un sábado en la noche.",
        icon: "🍋",
      },
    ],
  },
}

/**
 * Obtiene el contenido narrativo de una colección.
 * Si no hay contenido específico, devuelve un fallback genérico.
 */
export function getCollectionContent(slug: string): CollectionContent {
  const content = COLLECTION_CONTENT[slug]
  if (content) return content

  // Fallback genérico — tono premium B2B
  const fallbackName = slug.replace(/-/g, " ")
  return {
    heroTagline: "Insumos de calidad para un oficio que se respeta.",
    story: {
      title: "Nuestra Historia",
      body: `Cada restaurante tiene una historia. La tuya merece insumos que estén a la altura. En Resurte.me entendemos que cocinar para otros es un acto de generosidad — y queremos que nunca tengas que sacrificar calidad por volumen. Esta colección reúne los mejores productos para ${fallbackName}, seleccionados con el mismo cuidado que tú pones en cada plato.`,
    },
    values: [
      {
        title: "Calidad consistente",
        description: "Seleccionamos cada producto para que tu cocina mantenga el estándar que tus clientes esperan, lote tras lote. La consistencia es lo que construye reputación.",
        icon: "✨",
      },
      {
        title: "Precio institucional",
        description: "Compra por volumen sin mínimo de compra. Nuestros precios están diseñados para el negocio que crece, no para el consumidor final.",
        icon: "📦",
      },
      {
        title: "Entrega confiable",
        description: "Programa tus entregas y recibe a tiempo. Porque en una cocina profesional, la puntualidad del proveedor es tan importante como la del chef.",
        icon: "🚚",
      },
    ],
  }
}
