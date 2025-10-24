export interface AleoSigner {
  getPublicKey(path: string, display?: boolean): Promise<Buffer>;
  signTransaction(path: string, transaction: Buffer): Promise<Buffer>;
}
