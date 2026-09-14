import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds the richer intake fields a paseador's page collects beyond
 * bio/price (see ProviderProfile's comment): two public ones
 * (plans_offered, walking_spots — what they offer, not personal data)
 * and four private ones used for trust/verification only
 * (address/id_number/age/phone — never serialized by a public endpoint,
 * see ProvidersController).
 */
export class AddProviderProfileDetails1701400000000 implements MigrationInterface {
  name = 'AddProviderProfileDetails1701400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE providers_profiles ADD COLUMN plans_offered text NULL`);
    await queryRunner.query(`ALTER TABLE providers_profiles ADD COLUMN walking_spots text NULL`);
    await queryRunner.query(`ALTER TABLE providers_profiles ADD COLUMN address text NULL`);
    await queryRunner.query(`ALTER TABLE providers_profiles ADD COLUMN id_number text NULL`);
    await queryRunner.query(`ALTER TABLE providers_profiles ADD COLUMN age int NULL`);
    await queryRunner.query(`ALTER TABLE providers_profiles ADD COLUMN phone text NULL`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE providers_profiles DROP COLUMN phone`);
    await queryRunner.query(`ALTER TABLE providers_profiles DROP COLUMN age`);
    await queryRunner.query(`ALTER TABLE providers_profiles DROP COLUMN id_number`);
    await queryRunner.query(`ALTER TABLE providers_profiles DROP COLUMN address`);
    await queryRunner.query(`ALTER TABLE providers_profiles DROP COLUMN walking_spots`);
    await queryRunner.query(`ALTER TABLE providers_profiles DROP COLUMN plans_offered`);
  }
}
