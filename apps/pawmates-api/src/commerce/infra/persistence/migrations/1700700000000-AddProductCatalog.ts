import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * A master product catalog (PawMates Commerce follow-up): providers no
 * longer type a product's name/description/category freely — they pick
 * from this admin-curated list, same rationale OrderLineItem already
 * snapshots a Product's details rather than trusting a live reference:
 * the Product a provider lists still copies these fields at creation time
 * (see Product.catalogItemId), so a later catalog edit never silently
 * changes something a provider already put up for sale.
 *
 * Seeded with 100 generic pet-store items across every ProductCategory —
 * originals written for this seed, not scraped from any real retailer.
 * No photos yet (`photo_base64` starts NULL): the platform admin adds
 * those through the admin panel once this ships.
 *
 * Same 100 rows as this migration's original Postgres version — only the
 * table DDL changed for Turso/libSQL (see README's Database section).
 */
export class AddProductCatalog1700700000000 implements MigrationInterface {
  name = 'AddProductCatalog1700700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE commerce_catalog_items (
        id text PRIMARY KEY,
        name text NOT NULL,
        description text NULL,
        category text NOT NULL,
        suggested_price_amount bigint NOT NULL,
        suggested_price_currency text NOT NULL,
        photo_base64 text NULL,
        is_active boolean NOT NULL DEFAULT true,
        created_at datetime NOT NULL DEFAULT (datetime('now'))
      )
    `);
    await queryRunner.query(
      `CREATE INDEX idx_catalog_items_category ON commerce_catalog_items (category)`,
    );

    await queryRunner.query(
      `ALTER TABLE commerce_products ADD COLUMN catalog_item_id text NULL`,
    );

    await queryRunner.query(`
      INSERT INTO commerce_catalog_items (id, name, category, suggested_price_amount, suggested_price_currency) VALUES
              ('cat_07be05176ccd4b1d9742c607a1b54388', 'Galletas de pollo deshidratado 200g', 'treat', 875, 'USD'),
              ('cat_15e47e6713e1420288c758ee0300858a', 'Snacks de salmón liofilizado 100g', 'treat', 825, 'USD'),
              ('cat_c9763881a46e4885ba1b6fd52f08eb87', 'Huesos de cuero prensado x3', 'treat', 1125, 'USD'),
              ('cat_c9ae301bdd98425da36ce43ca0ad244b', 'Palitos dentales para perro x6', 'treat', 950, 'USD'),
              ('cat_2411ce04f3b44b80bcf34f20300b4387', 'Premios de hígado de res 150g', 'treat', 1000, 'USD'),
              ('cat_417fdc34c08f4b1987b43bd062a73377', 'Galletas integrales para perro 300g', 'treat', 950, 'USD'),
              ('cat_a87bf0e58fab493dbc1d6c188f6e7a69', 'Snacks de calabaza y avena 150g', 'treat', 825, 'USD'),
              ('cat_e90d26b298f84554b7faea078719eef6', 'Barritas de yogur para perro x10', 'treat', 525, 'USD'),
              ('cat_52ed22d3a4f64140811eaa00c0696219', 'Premios de entrenamiento sabor pollo 250g', 'treat', 450, 'USD'),
              ('cat_d9f4c336b7644dac95421e444aadaa5c', 'Snacks crujientes de batata 200g', 'treat', 575, 'USD'),
              ('cat_cea2b787d7e049c2a49329385f97118f', 'Galletas para cachorro con calcio 200g', 'treat', 625, 'USD'),
              ('cat_c4c82200c8a14f9fa0b87f7a132bc146', 'Premios dentales enzimáticos x8', 'treat', 1200, 'USD'),
              ('cat_1b3f6a11795144b19042e312b78e2665', 'Snacks de pato deshidratado 100g', 'treat', 975, 'USD'),
              ('cat_dc739d191dc84f63a2ef2102c195db28', 'Galletas sin granos sabor pescado 250g', 'treat', 925, 'USD'),
              ('cat_eb18704e4ee943d2b53e8ca1c6674790', 'Premios blandos para entrenamiento 200g', 'treat', 700, 'USD'),
              ('cat_3a9466efa54d43209e2989c965d2bea3', 'Snacks de queso para perro 100g', 'treat', 600, 'USD'),
              ('cat_32b323996e304c0bbfface74561c570b', 'Galletas artesanales de zanahoria 250g', 'treat', 475, 'USD'),
              ('cat_6da1b0d15836411dbcc3dc2093b708d8', 'Premios de cordero liofilizado 100g', 'treat', 1125, 'USD'),
              ('cat_2191d50480f54b8bb52fb859b3ebf47d', 'Snacks funcionales para articulaciones 150g', 'treat', 1075, 'USD'),
              ('cat_5e9923e07453476489af56a514064bcf', 'Galletas con menta para aliento fresco 200g', 'treat', 1075, 'USD'),
              ('cat_77ef7482a7084ff5a3b0c09c5118aa3c', 'Premios naturales de conejo 100g', 'treat', 750, 'USD'),
              ('cat_b26d1c532b3a45bf891937c16f700188', 'Snacks de arándano y avena 150g', 'treat', 625, 'USD'),
              ('cat_7ca30ced47b24ffebb48d59e8d1594a1', 'Galletas horneadas sabor mantequilla de maní 250g', 'treat', 1075, 'USD'),
              ('cat_a92bb5bb794445d38ba76ff1b4dfe8c3', 'Premios de venado deshidratado 100g', 'treat', 425, 'USD'),
              ('cat_6b8514c5bf9548abb1526437ac366e12', 'Mordedera comestible de piel de búfalo', 'treat', 1025, 'USD'),
              ('cat_b3a676b4b8e94e078529f5cd89440e25', 'Pelota de goma resistente', 'toy', 1950, 'USD'),
              ('cat_b66294015d4e4d90b197b46ac6e5c5d6', 'Cuerda de algodón trenzada', 'toy', 1725, 'USD'),
              ('cat_0ef08327574b477a9ef8a2e19c02d3b8', 'Peluche con sonido para perro', 'toy', 750, 'USD'),
              ('cat_022ab06519824a50bf88d46d462ef23a', 'Mordedera de caucho natural', 'toy', 1075, 'USD'),
              ('cat_74319d7c527f4c78ade020de2f68cc07', 'Frisbee flexible para perro', 'toy', 1500, 'USD'),
              ('cat_6380ee84d44841be8335b54f9314eacb', 'Juguete dispensador de premios', 'toy', 675, 'USD'),
              ('cat_9737221dede644d0b8261f0a6a76364b', 'Kong clásico resistente', 'toy', 975, 'USD'),
              ('cat_d92d3cbc572e4363bc6b56944b787a8b', 'Pelota con luz LED', 'toy', 1300, 'USD'),
              ('cat_158c6c3423a94b91accc11680a1af8fc', 'Anillo de goma para tirar', 'toy', 1675, 'USD'),
              ('cat_0d53888946dd4a9faec437cd84f63593', 'Juguete flotante para agua', 'toy', 975, 'USD'),
              ('cat_5600c952283949399d4098a0aa00c2fc', 'Peluche resistente sin relleno', 'toy', 1325, 'USD'),
              ('cat_d640abef0f194328a007c6bc7fbe9752', 'Cuerda con nudos triples', 'toy', 600, 'USD'),
              ('cat_08348470b5d348d2acaf3626684f16bb', 'Juguete interactivo rompecabezas', 'toy', 1400, 'USD'),
              ('cat_ba85d75f4b30423099e38513385f087f', 'Pelota de tenis para perro x3', 'toy', 1375, 'USD'),
              ('cat_d454a47e6e594d2786923107a24828a8', 'Mordedera con textura dental', 'toy', 1500, 'USD'),
              ('cat_c76461bbedf147df8186d737be411655', 'Juguete chirriante de goma', 'toy', 1575, 'USD'),
              ('cat_d6f40140e0f1497487a9e6d133666519', 'Frisbee de tela resistente al agua', 'toy', 1800, 'USD'),
              ('cat_87ddd9c566c849748781a912617967a8', 'Pelota dispensadora de snacks', 'toy', 1750, 'USD'),
              ('cat_3f0bad13f3ad47c3823f11363b9836ad', 'Juguete de cuerda con pelota', 'toy', 925, 'USD'),
              ('cat_616327f0807f476596c57052c3ee0f76', 'Muñeco de peluche con squeaker', 'toy', 1775, 'USD'),
              ('cat_86f7a27512114a8eb1cbf86b77e3fa5d', 'Anillo mordedor para cachorros', 'toy', 1200, 'USD'),
              ('cat_6f25af9a889e4bacb38f00004d787beb', 'Juguete de agarre para tirar', 'toy', 1875, 'USD'),
              ('cat_dc6099cad05e463982aa6c996f51dfca', 'Pelota rebotadora irregular', 'toy', 800, 'USD'),
              ('cat_ada7ab8ea20a4e0bb63051f21a27a416', 'Mordedera de nylon sabor carne', 'toy', 1775, 'USD'),
              ('cat_d94b695c8fd1415c87b8261b82e353a5', 'Juguete rompecabezas nivel avanzado', 'toy', 1000, 'USD'),
              ('cat_078fee3e76614c23974bdad4f50de7be', 'Correa de nylon reflectante 1.5m', 'accessory', 875, 'USD'),
              ('cat_1b3023b9baa549bebebec0a8f5af4c4a', 'Arnés ajustable acolchado', 'accessory', 2600, 'USD'),
              ('cat_3ec44a99a16b4c1db4626ca2080a6d9d', 'Collar de cuero genuino', 'accessory', 900, 'USD'),
              ('cat_de53a906f1aa4546a781495b0da5efcf', 'Plato doble de acero inoxidable', 'accessory', 1375, 'USD'),
              ('cat_74bb8326a9c24c58a5d4d0a815191774', 'Cama ortopédica mediana', 'accessory', 4275, 'USD'),
              ('cat_c4dec84a13c649f2b3f446cc924a0f0f', 'Manta polar para mascota', 'accessory', 1700, 'USD'),
              ('cat_9a1bc235046b49dfbe7cceed34b66fbc', 'Transportadora plástica mediana', 'accessory', 2000, 'USD'),
              ('cat_3b1994ec0ede434a8ac9111116269adf', 'Bozal de malla ajustable', 'accessory', 3075, 'USD'),
              ('cat_b3632cc6527d4a3db9eac3f87dc7e48a', 'Cepillo deslanador', 'accessory', 3525, 'USD'),
              ('cat_18a1827160dd4f71becfab9a81603668', 'Cortauñas profesional', 'accessory', 2975, 'USD'),
              ('cat_1bc2a39711884d77b14c625bf80e52e6', 'Impermeable para perro talla M', 'accessory', 3775, 'USD'),
              ('cat_9f9ebe516b8445a68917b42d44221ac3', 'Suéter de lana para invierno', 'accessory', 3050, 'USD'),
              ('cat_9ab305c096d2486cbdbcb2f416c5f0da', 'Placa de identificación grabada', 'accessory', 3100, 'USD'),
              ('cat_44a2f504502c438f9509ca1b78ef97cb', 'Correa retráctil 5 metros', 'accessory', 1125, 'USD'),
              ('cat_53dad372ce604d0ea9ebf081e8f9153a', 'Comedero elevado doble', 'accessory', 1800, 'USD'),
              ('cat_fb991c3510924b7da632154f63a9c250', 'Cama tipo donut suave', 'accessory', 1100, 'USD'),
              ('cat_5dca8155d3944adeb0aa969168b9c36c', 'Bolsa dispensadora de popó (rollo x6)', 'accessory', 4125, 'USD'),
              ('cat_e12708143b634ba0984743001e0fec3e', 'Champú hipoalergénico 500ml', 'accessory', 4400, 'USD'),
              ('cat_acd7e1a29c674c1fb93100ce47ea06db', 'Cepillo de dientes para mascota', 'accessory', 1675, 'USD'),
              ('cat_bda5f78914f34368a3f8566081932cbc', 'Toalla de secado rápido', 'accessory', 3800, 'USD'),
              ('cat_598e46a84b2e41cf916b57efa35d8a2a', 'Chaleco reflectante de seguridad', 'accessory', 1625, 'USD'),
              ('cat_0e2d14f343c34614ada9b7bd5f92c1c0', 'Casa portátil plegable', 'accessory', 2350, 'USD'),
              ('cat_775cb4b478c1430299fecc8a9cf22cfd', 'Rampa plegable para auto', 'accessory', 1075, 'USD'),
              ('cat_77249792cdfa46eba172b49605abd949', 'Cinturón de seguridad para auto', 'accessory', 900, 'USD'),
              ('cat_4748507e14794bc688ec93742600b880', 'Bebedero automático 2L', 'accessory', 1350, 'USD'),
              ('cat_cc23e4bb37b5445b8b1cd7d52e968e84', 'Comedero antivoracidad', 'accessory', 2125, 'USD'),
              ('cat_141095de50dd40bc8c382f4b66eafc2a', 'Peine para nudos', 'accessory', 2800, 'USD'),
              ('cat_e065b578cd90451e8060e522911b75f7', 'Guantes de aseo de silicona', 'accessory', 4475, 'USD'),
              ('cat_e8d37f44ff73451b9bcb78d3da285686', 'Botiquín básico para mascotas', 'accessory', 2375, 'USD'),
              ('cat_e40e5735a8a8458fb2631a068bb75d6b', 'Camiseta de algodón para perro', 'accessory', 2200, 'USD'),
              ('cat_30ec51c4c8f74387825b51caee2b4b9d', 'Baño y cepillado durante el paseo', 'service_addon', 1025, 'USD'),
              ('cat_c7bb9205513e471e95912f8b4b405329', 'Sesión extra de entrenamiento básico', 'service_addon', 1450, 'USD'),
              ('cat_7c9eede77d234738b749a93d6f690ce2', 'Reporte fotográfico detallado del paseo', 'service_addon', 1125, 'USD'),
              ('cat_7fe062f3ab1642199de87b31d505e646', 'Paseo nocturno adicional', 'service_addon', 525, 'USD'),
              ('cat_2c0c493d250e4b39a2a4a507349d65d5', 'Cuidado de mascota por hora extra', 'service_addon', 1625, 'USD'),
              ('cat_4e8a47a211254a7ea65257bab9d0d499', 'Corte de uñas durante la visita', 'service_addon', 1150, 'USD'),
              ('cat_454635c9454d4a0ab0423fa7c760418d', 'Administración de medicamento programado', 'service_addon', 1750, 'USD'),
              ('cat_346b86be52cf4ff98d739c7ea8491ade', 'Juego adicional en el parque', 'service_addon', 750, 'USD'),
              ('cat_b135e68003f64ce89c09fc80d881a28f', 'Recogida y entrega a domicilio', 'service_addon', 1525, 'USD'),
              ('cat_88a540a75b1244b08e2bee90fa0c9007', 'Sesión de socialización con otros perros', 'service_addon', 1300, 'USD'),
              ('cat_c9784104dc624830afea6a95d236b790', 'Suplemento vitamínico multivitamínico', 'other', 2900, 'USD'),
              ('cat_0f3189f772a24d7890ff904045970b38', 'Aceite de salmón para pelaje 250ml', 'other', 2575, 'USD'),
              ('cat_3e9c2af7389d4b309b473a0d01be3a47', 'Probiótico digestivo en polvo', 'other', 2225, 'USD'),
              ('cat_d2eaeacbe6f34fefa23565591a672031', 'Repelente natural de pulgas y garrapatas', 'other', 2050, 'USD'),
              ('cat_82c2d4925ad4496db102c1b4f1b20f8d', 'Desparasitante oral mensual', 'other', 1575, 'USD'),
              ('cat_65a3333ac4ec4244b8b92a5c7eeb3e39', 'Suplemento para articulaciones con glucosamina', 'other', 1025, 'USD'),
              ('cat_c9cd9f21c80e47b9b103f277ac41591f', 'Spray calmante de feromonas', 'other', 1825, 'USD'),
              ('cat_fa5f1f0ee0c4457f819f121123dce694', 'Toallitas húmedas para mascotas x80', 'other', 2350, 'USD'),
              ('cat_4feaa221d4a743b2983aec1e4d3ba283', 'Ambientador neutralizador de olores', 'other', 1725, 'USD'),
              ('cat_8d46a3161fdf4c709f8d4e1f3ae2ede2', 'Kit de primeros auxilios para mascotas', 'other', 3475, 'USD');
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE commerce_products DROP COLUMN catalog_item_id`,
    );
    await queryRunner.query(`DROP TABLE commerce_catalog_items`);
  }
}
