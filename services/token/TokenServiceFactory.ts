import { TokenService } from './TokenService';
import { TokenServiceInterface, TokenType } from './TokenServiceInterface';
import { LoggerFactory } from '../logger/LoggerFactory';
import { ECommercePlatform } from '../../utils/platforms';
import { MagentoApiClient } from '../clients/magento/MagentoApiClient';
import { SecretsServiceFactory } from '../secrets/SecretsService';

/**
 * Factory for managing TokenService instances
 * Provides centralized access to token management functionality
 */
export class TokenServiceFactory {
  private static instance: TokenServiceFactory;
  private service: TokenServiceInterface;
  private logger: ReturnType<typeof LoggerFactory.prototype.createLogger>;
  private platformProviders: Map<string, boolean> = new Map();

  private constructor() {
    this.logger = LoggerFactory.getInstance().createLogger('TokenServiceFactory');
    this.service = TokenService.getInstance();
  }

  /**
   * Get the singleton instance of TokenServiceFactory
   */
  public static getInstance(): TokenServiceFactory {
    if (!TokenServiceFactory.instance) {
      TokenServiceFactory.instance = new TokenServiceFactory();
    }
    return TokenServiceFactory.instance;
  }

  /**
   * Get the token service instance
   */
  public getService(): TokenServiceInterface {
    return this.service;
  }

  /**
   * Initialize platform-specific token providers
   * This registers functions that know how to obtain fresh tokens
   * @param platform The platform to initialize
   * @returns True if initialization was successful
   */
  public async initializePlatformProvider(platform: ECommercePlatform): Promise<boolean> {
    if (this.platformProviders.has(platform)) {
      return true;
    }

    try {
      switch (platform) {
        case ECommercePlatform.MAGENTO:
          this.setupMagentoTokenProvider();
          break;
        case ECommercePlatform.SHOPIFY:
          this.setupShopifyTokenProvider();
          break;
        case ECommercePlatform.BIGCOMMERCE:
          this.setupBigCommerceTokenProvider();
          break;
        case ECommercePlatform.WOOCOMMERCE:
          this.setupWooCommerceTokenProvider();
          break;
        case ECommercePlatform.SYLIUS:
          this.setupSyliusTokenProvider();
          break;
        case ECommercePlatform.WIX:
          this.setupWixTokenProvider();
          break;
        // These platforms use API key authentication and don't need token providers
        case ECommercePlatform.PRESTASHOP:
        case ECommercePlatform.SQUARESPACE:
        case ECommercePlatform.OFFLINE:
          this.logger.info(`Platform ${platform} does not require token management`);
          return false;
        default:
          this.logger.warn(`No token provider implementation for platform: ${platform}`);
          return false;
      }

      this.platformProviders.set(platform, true);
      this.logger.info(`Token provider initialized for platform: ${platform}`);
      return true;
    } catch (error) {
      this.logger.error(
        { message: `Failed to initialize token provider for ${platform}` },
        error instanceof Error ? error : new Error(String(error))
      );
      return false;
    }
  }

  /**
   * Setup Magento token provider.
   * Reads credentials from secrets store first, falls back to env vars.
   */
  private setupMagentoTokenProvider(): void {
    this.service.registerTokenProvider(ECommercePlatform.MAGENTO, async (_platform, tokenType) => {
      const secretsService = SecretsServiceFactory.getInstance().getService();

      try {
        let username: string | undefined;
        let password: string | undefined;
        let apiUrl: string | undefined;

        // Try secrets store first
        const credentials = await secretsService.getSecret('magento_api_credentials');
        if (credentials) {
          const parsed = JSON.parse(credentials);
          username = parsed.username;
          password = parsed.password;
          apiUrl = parsed.apiUrl;
        }

        // Fall back to environment variables
        username = username || process.env.MAGENTO_USERNAME;
        password = password || process.env.MAGENTO_PASSWORD;
        apiUrl = apiUrl || process.env.MAGENTO_STORE_URL;

        if (!username || !password || !apiUrl) {
          throw new Error('Magento credentials not found in secrets store or environment variables');
        }

        const token = await MagentoApiClient.getInstance().fetchAdminToken(apiUrl, username, password);

        const expiresAt =
          tokenType === TokenType.REFRESH
            ? Date.now() + 24 * 3600 * 1000 // 24 h for refresh
            : Date.now() + 3600 * 1000; // 1 h for access

        return { token, expiresAt };
      } catch (error) {
        this.logger.error({ message: 'Failed to obtain Magento token' }, error instanceof Error ? error : new Error(String(error)));
        throw error;
      }
    });
  }

  /**
   * Setup Shopify token provider
   */
  private setupShopifyTokenProvider(): void {
    this.service.registerTokenProvider(ECommercePlatform.SHOPIFY, async (_platform, tokenType) => {
      const secretsService = SecretsServiceFactory.getInstance().getService();

      try {
        const credentials = await secretsService.getSecret('shopify_api_credentials');
        if (!credentials) {
          throw new Error('Shopify API credentials not found');
        }

        return {
          token: `shopify-${tokenType}-${Date.now()}`,
          expiresAt: Date.now() + 24 * 3600 * 1000,
        };
      } catch (error) {
        this.logger.error({ message: 'Failed to obtain Shopify token' }, error instanceof Error ? error : new Error(String(error)));
        throw error;
      }
    });
  }

  /**
   * Setup BigCommerce token provider
   */
  private setupBigCommerceTokenProvider(): void {
    this.service.registerTokenProvider(ECommercePlatform.BIGCOMMERCE, async (_platform, tokenType) => {
      const secretsService = SecretsServiceFactory.getInstance().getService();

      try {
        const credentials = await secretsService.getSecret('bigcommerce_api_credentials');
        if (!credentials) {
          throw new Error('BigCommerce API credentials not found');
        }

        return {
          token: `bigcommerce-${tokenType}-${Date.now()}`,
          expiresAt: Date.now() + 7 * 24 * 3600 * 1000,
        };
      } catch (error) {
        this.logger.error({ message: 'Failed to obtain BigCommerce token' }, error instanceof Error ? error : new Error(String(error)));
        throw error;
      }
    });
  }

  /**
   * Setup WooCommerce token provider
   */
  private setupWooCommerceTokenProvider(): void {
    this.service.registerTokenProvider(ECommercePlatform.WOOCOMMERCE, async (_platform, _tokenType) => {
      const secretsService = SecretsServiceFactory.getInstance().getService();

      try {
        const credentials = await secretsService.getSecret('woocommerce_api_credentials');
        if (!credentials) {
          throw new Error('WooCommerce API credentials not found');
        }

        return { token: JSON.parse(credentials).consumerKey, expiresAt: undefined };
      } catch (error) {
        this.logger.error({ message: 'Failed to obtain WooCommerce token' }, error instanceof Error ? error : new Error(String(error)));
        throw error;
      }
    });
  }

  /**
   * Setup Sylius token provider.
   * Calls the Sylius shop authentication-token endpoint to get a real JWT.
   * Falls back to env var SYLIUS_ACCESS_TOKEN if credentials aren't available.
   */
  private setupSyliusTokenProvider(): void {
    this.service.registerTokenProvider(ECommercePlatform.SYLIUS, async (_platform, _tokenType) => {
      const secretsService = SecretsServiceFactory.getInstance().getService();

      try {
        // 1. Try a pre-stored access token from env (set by fetch-credentials.sh)
        const envToken = process.env.SYLIUS_ACCESS_TOKEN;
        if (envToken) {
          return { token: envToken, expiresAt: Date.now() + 3600 * 1000 };
        }

        // 2. Try credentials from secrets store
        const credentials = await secretsService.getSecret('sylius_api_credentials');
        if (credentials) {
          const { email, password, storeUrl } = JSON.parse(credentials);
          const baseUrl = (storeUrl || process.env.SYLIUS_API_URL || '').replace(/\/+$/, '');
          const response = await fetch(`${baseUrl}/api/v2/shop/authentication-token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password }),
          });
          if (!response.ok) throw new Error(`Sylius auth failed: ${response.status}`);
          const data = (await response.json()) as { token?: string };
          if (!data.token) throw new Error('Sylius auth response missing token');
          return { token: data.token, expiresAt: Date.now() + 3600 * 1000 };
        }

        throw new Error('Sylius credentials not found in secrets store or SYLIUS_ACCESS_TOKEN env var');
      } catch (error) {
        this.logger.error({ message: 'Failed to obtain Sylius token' }, error instanceof Error ? error : new Error(String(error)));
        throw error;
      }
    });
  }

  /**
   * Setup Wix token provider
   */
  private setupWixTokenProvider(): void {
    this.service.registerTokenProvider(ECommercePlatform.WIX, async (_platform, tokenType) => {
      const secretsService = SecretsServiceFactory.getInstance().getService();

      try {
        const credentials = await secretsService.getSecret('wix_api_credentials');
        if (!credentials) {
          throw new Error('Wix API credentials not found');
        }

        return {
          token: `wix-${tokenType}-${Date.now()}`,
          expiresAt: Date.now() + 24 * 3600 * 1000,
        };
      } catch (error) {
        this.logger.error({ message: 'Failed to obtain Wix token' }, error instanceof Error ? error : new Error(String(error)));
        throw error;
      }
    });
  }
}
