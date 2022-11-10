export class ProxyService {
  private static _instance: ProxyService | undefined = undefined;

  /**
   * Get singleton
   * @returns
   */
  public static getInstance(): ProxyService {
    if (!this._instance) {
      this._instance = new ProxyService();
    }
    return this._instance;
  }
}
