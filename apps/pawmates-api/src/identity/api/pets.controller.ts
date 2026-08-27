import {
  CurrentAccount,
  JwtAuthGuard,
  ResourceNotFoundError,
  ValidationError,
} from '@pawmates/common';
import type { AuthenticatedAccount } from '@pawmates/common';
import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Pet } from '../domain/entities/pet.entity';
import { CreatePetDto, UpdatePetDto } from './dto/pet.dto';

@Controller('v1/pets')
@UseGuards(JwtAuthGuard)
export class PetsController {
  constructor(@InjectRepository(Pet) private readonly pets: Repository<Pet>) {}

  @Post()
  async create(
    @Body() dto: CreatePetDto,
    @CurrentAccount() account: AuthenticatedAccount,
  ) {
    const pet = new Pet();
    pet.ownerId = account.accountId;
    pet.name = dto.name;
    pet.breed = dto.breed;
    pet.size = dto.size;
    pet.temperament = dto.temperament;
    pet.vaccines = dto.vaccines;
    pet.photoBase64 = dto.photo ?? null;
    await this.pets.save(pet);
    return { data: toPetResponse(pet) };
  }

  @Get()
  async list(@CurrentAccount() account: AuthenticatedAccount) {
    const rows = await this.pets.find({
      where: { ownerId: account.accountId },
      order: { createdAt: 'ASC' },
    });
    return { data: rows.map(toPetResponse) };
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdatePetDto,
    @CurrentAccount() account: AuthenticatedAccount,
  ) {
    const pet = await this.pets.findOne({ where: { id } });
    if (!pet) throw new ResourceNotFoundError(`Pet ${id} no existe.`);
    if (pet.ownerId !== account.accountId) {
      throw new ValidationError('Esta mascota no es tuya.');
    }
    if (dto.name !== undefined) pet.name = dto.name;
    if (dto.breed !== undefined) pet.breed = dto.breed;
    if (dto.size !== undefined) pet.size = dto.size;
    if (dto.temperament !== undefined) pet.temperament = dto.temperament;
    if (dto.vaccines !== undefined) pet.vaccines = dto.vaccines;
    if (dto.photo !== undefined) pet.photoBase64 = dto.photo;
    await this.pets.save(pet);
    return { data: toPetResponse(pet) };
  }
}

function toPetResponse(pet: Pet) {
  return {
    id: pet.id,
    name: pet.name,
    breed: pet.breed,
    size: pet.size,
    temperament: pet.temperament,
    vaccines: pet.vaccines,
    photo: pet.photoBase64,
  };
}
