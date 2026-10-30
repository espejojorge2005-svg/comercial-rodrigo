import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const INSECURE_PLACEHOLDER_SECRET = 'comercial_rodrigo_super_secret_jwt_key_2026_xyz';
const DEV_FALLBACK_SECRET = 'dev_only_local_jwt_secret_do_not_use_in_prod_2026';
const logger = new Logger('SecurityBootstrap');
let warnedPlaceholderSecret = false;

/**
 * Resuelve la clave secreta JWT exigiendo configuración explícita y robusta en producción.
 */
export function resolveJwtSecret(configService: ConfigService): string {
  const configured = configService.get<string>('JWT_SECRET')?.trim();
  const isProd = process.env.NODE_ENV === 'production';

  if (isProd) {
    if (!configured || configured.length < 16) {
      throw new Error(
        'FATAL SECURITY ERROR: JWT_SECRET debe estar configurado en producción con al menos 16 caracteres.',
      );
    }

    if (configured === INSECURE_PLACEHOLDER_SECRET) {
      if (process.env.STRICT_JWT_SECRET === 'true') {
        throw new Error(
          'FATAL SECURITY ERROR: JWT_SECRET no puede usar el valor de ejemplo cuando STRICT_JWT_SECRET=true.',
        );
      }
      if (!warnedPlaceholderSecret) {
        warnedPlaceholderSecret = true;
        logger.warn(
          'ADVERTENCIA DE SEGURIDAD: JWT_SECRET en producción coincide con el valor de ejemplo (.env.example). Se recomienda rotarlo por una clave aleatoria antes del despliegue definitivo.',
        );
      }
    }

    return configured;
  }

  return configured || DEV_FALLBACK_SECRET;
}

