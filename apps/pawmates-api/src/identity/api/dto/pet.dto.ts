import {
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

const SIZES = ['Pequeño', 'Mediano', 'Grande'];

export class CreatePetDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsString()
  breed!: string;

  @IsIn(SIZES)
  size!: string;

  @IsArray()
  @IsString({ each: true })
  temperament!: string[];

  @IsArray()
  @IsString({ each: true })
  vaccines!: string[];

  @IsString()
  @IsOptional()
  photo?: string;
}

export class UpdatePetDto {
  @IsString()
  @MinLength(1)
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  breed?: string;

  @IsIn(SIZES)
  @IsOptional()
  size?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  temperament?: string[];

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  vaccines?: string[];

  @IsString()
  @IsOptional()
  photo?: string;
}
