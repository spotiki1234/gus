// nft.pricing.ts
interface GiftNftAttributes {
  serialNumber: string;
  model: string;
  pattern: string;
  backdrop: string;
  floorPriceTon: number;
  imageUrl: string;
}

export class GiftPricingService {
  // Публичный открытый эндпоинт TonAPI
  private static TONAPI_BASE = 'https://tonapi.io/v2';

  /**
   * Получение атрибутов и минимальной рыночной цены (Floor Price) по адресу NFT подарка
   */
  public static async getNftGiftDetails(nftAddress: string): Promise<GiftNftAttributes> {
    try {
      // 1. Получаем метаданные предмета (номер, модель, изображение)
      const itemRes = await fetch(`${this.TONAPI_BASE}/nfts/${nftAddress}`);
      const itemData = await itemRes.json();

      const metadata = itemData.metadata || {};
      const attributes: Array<{ trait_type: string; value: string }> = metadata.attributes || [];

      // Извлекаем атрибуты модели и узора
      const modelTrait = attributes.find((a) => a.trait_type.toLowerCase() === 'model')?.value || 'Classic';
      const patternTrait = attributes.find((a) => a.trait_type.toLowerCase() === 'pattern')?.value || 'Original';
      const backdropTrait = attributes.find((a) => a.trait_type.toLowerCase() === 'backdrop')?.value || 'Default';

      // 2. Получаем рыночную цену коллекции на маркетплейсах (Getgems)
      const collectionAddress = itemData.collection?.address;
      let floorPrice = 5.0; // Базовая цена по умолчанию, если лот вне торгов

      if (collectionAddress) {
        const colRes = await fetch(`${this.TONAPI_BASE}/nfts/collections/${collectionAddress}`);
        const colData = await colRes.json();
        // В TonAPI floor_price возвращается в нанотонах (1 TON = 1e9 nanoTON)
        if (colData.floor_price) {
          floorPrice = parseFloat((Number(colData.floor_price) / 1e9).toFixed(2));
        }
      }

      // 3. Формируем серийный номер (например, #3417)
      const index = itemData.index !== undefined ? `#${itemData.index}` : '#0000';

      return {
        serialNumber: index,
        model: modelTrait,
        pattern: patternTrait,
        backdrop: backdropTrait,
        floorPriceTon: Math.max(floorPrice, 0.5), // Минимальный порог 0.5 TON
        imageUrl: metadata.image || 'https://ton.org/download/ton_symbol.png',
      };
    } catch (err) {
      console.error('Ошибка оценки NFT подарка:', err);
      // Fallback-значения
      return {
        serialNumber: '#0000',
        model: 'Standard',
        pattern: 'Classic',
        backdrop: 'Default',
        floorPriceTon: 2.0,
        imageUrl: 'https://ton.org/download/ton_symbol.png',
      };
    }
  }

  /**
   * Расчет залоговой стоимости для игрока (90% от рынка)
   */
  public static calculatePlayerDepositPrice(floorPriceTon: number): number {
    return Number((floorPriceTon * 0.90).toFixed(2));
  }

  /**
   * Расчет витринной стоимости для магазина банка (105% от рынка)
   */
  public static calculateBankShopPrice(floorPriceTon: number): number {
    return Number((floorPriceTon * 1.05).toFixed(2));
  }
}
