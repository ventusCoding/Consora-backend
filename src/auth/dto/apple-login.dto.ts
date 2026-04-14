import { IsOptional, IsString } from 'class-validator';

export class AppleLoginDto {
  /** Apple identity token (JWT) from sign_in_with_apple on the client. */
  @IsString() identityToken: string;
  // Apple only gives us the user's name on the very first sign-in and only
  // if the user taps "Share My Name" — so we accept these as optional
  // hints and only use them when creating a brand-new account.
  @IsOptional() @IsString() firstName?: string;
  @IsOptional() @IsString() lastName?: string;
}
