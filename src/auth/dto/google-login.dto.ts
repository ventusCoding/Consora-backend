import { IsString } from 'class-validator';

export class GoogleLoginDto {
  /** Google ID token (JWT) obtained client-side from google_sign_in. */
  @IsString() idToken: string;
}
