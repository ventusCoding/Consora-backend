import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class CreateChallengeDto {
  @IsString() name: string;
  @IsString() description: string;
  @IsOptional() @IsString() image?: string;
  @IsDateString() startDate: string;
  @IsDateString() endDate: string;
  @IsOptional() @IsString() dailyRequirement?: string;
  @IsOptional() @IsIn(['easy', 'medium', 'hard']) difficulty?:
    | 'easy'
    | 'medium'
    | 'hard';
  @IsOptional() @IsString() category?: string;
  @IsOptional() @IsBoolean() isPublic?: boolean;
  @IsOptional() @IsBoolean() isPaid?: boolean;
  @IsOptional() @IsNumber() @Min(0) price?: number;
  @IsOptional() @IsString() currency?: string;
}
