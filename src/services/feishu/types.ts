/**
 * 飞书 API 类型定义
 */

export interface FeishuAccessTokenResponse {
  code: number;
  msg: string;
  tenant_access_token?: string;
  expire: number;
}

export interface FeishuMessageResponse {
  code: number;
  msg: string;
  data?: {
    message_id: string;
  };
}

export interface FeishuCardAction {
  tag: 'button';
  text: {
    tag: 'plain_text';
    content: string;
  };
  type?: 'default' | 'primary' | 'danger';
  value: Record<string, any>;
}

export interface FeishuCardElement {
  tag: string;
  [key: string]: any;
}

export interface FeishuCard {
  config?: {
    wide_screen_mode?: boolean;
  };
  header?: {
    title: {
      tag: 'plain_text';
      content: string;
    };
    template?: string;
  };
  elements: FeishuCardElement[];
}

export interface FeishuEventHeader {
  event_id: string;
  event_type: string;
  create_time: string;
  token: string;
  app_id: string;
}

export interface FeishuCardActionEvent {
  open_id: string;
  user_id: string;
  open_message_id: string;
  action: {
    value: Record<string, any>;
    tag: string;
  };
}

export interface FeishuEvent {
  schema: string;
  header: FeishuEventHeader;
  event: FeishuCardActionEvent;
}
