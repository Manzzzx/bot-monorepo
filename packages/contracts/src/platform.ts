export type Platform = 'wa' | 'tele';

export interface PlatformCapabilities {
  buttons: boolean;
  list: boolean;
  edit: boolean;
  reactions: boolean;
}
