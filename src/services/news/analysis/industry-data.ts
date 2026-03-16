/**
 * 产业链数据
 * 从 YAML 数据加载
 */

export interface StockInfo {
  code: string;
  name: string;
}

export interface ChainLevel {
  coefficient: number;
  stocks: StockInfo[];
}

export interface IndustryChain {
  name: string;
  market: 'a' | 'hk' | 'us';
  keywords: string[];
  chain: {
    downstream: ChainLevel;
    midstream: ChainLevel;
    upstream: ChainLevel;
  };
}

// A股产业链数据
const A_STOCK_INDUSTRIES: IndustryChain[] = [
  {
    name: '新能源汽车',
    market: 'a',
    keywords: [
      '新能源', '电动汽车', '电动车', '锂电池', '动力电池', 
      '购车补贴', '购置税', '新能源车', '比亚迪', '宁德时代',
      '新能源汽车', '车购税', '销量', '动力电池', '锂电池'
    ],
    chain: {
      downstream: {
        coefficient: 1.0,
        stocks: [
          { code: '002594', name: '比亚迪' },
          { code: '000625', name: '长安汽车' },
          { code: '601633', name: '长城汽车' },
          { code: '600104', name: '上汽集团' },
          { code: '601238', name: '广汽集团' },
        ],
      },
      midstream: {
        coefficient: 0.8,
        stocks: [
          { code: '300750', name: '宁德时代' },
          { code: '002074', name: '国轩高科' },
          { code: '002812', name: '恩捷股份' },
          { code: '300014', name: '亿纬锂能' },
        ],
      },
      upstream: {
        coefficient: 0.6,
        stocks: [
          { code: '002460', name: '赣锋锂业' },
          { code: '002466', name: '天齐锂业' },
          { code: '000792', name: '盐湖股份' },
          { code: '002192', name: '融捷股份' },
        ],
      },
    },
  },
  {
    name: '医药生物',
    market: 'a',
    keywords: ['创新药', '仿制药', '集采', '医保', '新药获批', '临床', 'CXO', '医药', '制药'],
    chain: {
      downstream: {
        coefficient: 1.0,
        stocks: [
          { code: '600276', name: '恒瑞医药' },
          { code: '600196', name: '复星医药' },
          { code: '000963', name: '华东医药' },
          { code: '000538', name: '云南白药' },
        ],
      },
      midstream: {
        coefficient: 0.8,
        stocks: [
          { code: '603259', name: '药明康德' },
          { code: '300759', name: '康龙化成' },
          { code: '300347', name: '泰格医药' },
        ],
      },
      upstream: {
        coefficient: 0.6,
        stocks: [
          { code: '600436', name: '片仔癀' },
          { code: '600085', name: '同仁堂' },
          { code: '600332', name: '白云山' },
        ],
      },
    },
  },
  {
    name: '房地产',
    market: 'a',
    keywords: ['房地产', '地产', '购房', '限购', '降息', '首付', '房贷', '宽松政策'],
    chain: {
      downstream: {
        coefficient: 1.0,
        stocks: [
          { code: '000002', name: '万科A' },
          { code: '600048', name: '保利地产' },
          { code: '001979', name: '招商蛇口' },
          { code: '601155', name: '新城控股' },
        ],
      },
      midstream: {
        coefficient: 0.8,
        stocks: [
          { code: '002310', name: '东方园林' },
          { code: '000786', name: '北新建材' },
          { code: '603816', name: '顾家家居' },
        ],
      },
      upstream: {
        coefficient: 0.6,
        stocks: [
          { code: '600585', name: '海螺水泥' },
          { code: '600801', name: '华新水泥' },
          { code: '600019', name: '宝钢股份' },
        ],
      },
    },
  },
  {
    name: '半导体',
    market: 'a',
    keywords: ['芯片', '半导体', '集成电路', '光刻机', '晶圆', 'AI芯片', '处理器'],
    chain: {
      downstream: {
        coefficient: 1.0,
        stocks: [
          { code: '688981', name: '中芯国际' },
          { code: '688256', name: '寒武纪' },
          { code: '688505', name: '复旦微电' },
        ],
      },
      midstream: {
        coefficient: 0.8,
        stocks: [
          { code: '600584', name: '长电科技' },
          { code: '002156', name: '通富微电' },
          { code: '002185', name: '华天科技' },
        ],
      },
      upstream: {
        coefficient: 0.6,
        stocks: [
          { code: '688126', name: '沪硅产业' },
          { code: '688012', name: '中微公司' },
          { code: '002371', name: '北方华创' },
        ],
      },
    },
  },
  {
    name: '食品饮料',
    market: 'a',
    keywords: [
      '白酒', '消费', '食品', '饮料', '乳制品', '提价', '食品饮料',
      '茅台', '五粮液', '泸州老窖', '伊利', '海天', '出厂价', '涨价',
      '啤酒', '乳业', '零食', '调味品'
    ],
    chain: {
      downstream: {
        coefficient: 1.0,
        stocks: [
          { code: '600519', name: '贵州茅台' },
          { code: '000858', name: '五粮液' },
          { code: '603288', name: '海天味业' },
          { code: '600887', name: '伊利股份' },
        ],
      },
      midstream: {
        coefficient: 0.8,
        stocks: [
          { code: '000895', name: '双汇发展' },
          { code: '603345', name: '安井食品' },
        ],
      },
      upstream: {
        coefficient: 0.6,
        stocks: [
          { code: '09696', name: '农夫山泉' },
          { code: '600600', name: '青岛啤酒' },
          { code: '300999', name: '金龙鱼' },
        ],
      },
    },
  },
];

// 港股产业链数据
const HK_STOCK_INDUSTRIES: IndustryChain[] = [
  {
    name: '科技互联网',
    market: 'hk',
    keywords: ['互联网', '科技', '电商', '云计算', 'AI', '元宇宙'],
    chain: {
      downstream: {
        coefficient: 1.0,
        stocks: [
          { code: '00700', name: '腾讯控股' },
          { code: '09988', name: '阿里巴巴' },
          { code: '03690', name: '美团' },
          { code: '09618', name: '京东集团' },
        ],
      },
      midstream: {
        coefficient: 0.8,
        stocks: [
          { code: '01024', name: '快手' },
          { code: '09626', name: '哔哩哔哩' },
          { code: '01810', name: '小米集团' },
        ],
      },
      upstream: {
        coefficient: 0.6,
        stocks: [
          { code: '00992', name: '联想集团' },
          { code: '02318', name: '鸿海精密' },
        ],
      },
    },
  },
];

// 美股产业链数据
const US_STOCK_INDUSTRIES: IndustryChain[] = [
  {
    name: '科技',
    market: 'us',
    keywords: ['科技', 'AI', '云计算', '软件', '互联网'],
    chain: {
      downstream: {
        coefficient: 1.0,
        stocks: [
          { code: 'AAPL', name: '苹果' },
          { code: 'MSFT', name: '微软' },
          { code: 'GOOG', name: '谷歌' },
          { code: 'AMZN', name: '亚马逊' },
        ],
      },
      midstream: {
        coefficient: 0.8,
        stocks: [
          { code: 'QCOM', name: '高通' },
          { code: 'NVDA', name: '英伟达' },
          { code: 'TSM', name: '台积电' },
        ],
      },
      upstream: {
        coefficient: 0.6,
        stocks: [
          { code: 'ASML', name: 'ASML' },
          { code: 'AMAT', name: '应用材料' },
        ],
      },
    },
  },
  {
    name: '新能源汽车',
    market: 'us',
    keywords: ['特斯拉', 'Tesla', '电动车', '新能源汽车', '自动驾驶'],
    chain: {
      downstream: {
        coefficient: 1.0,
        stocks: [
          { code: 'TSLA', name: '特斯拉' },
          { code: 'RIVN', name: 'Rivian' },
          { code: 'LCID', name: 'Lucid' },
        ],
      },
      midstream: {
        coefficient: 0.8,
        stocks: [
          { code: 'PANW', name: '松下' },
        ],
      },
      upstream: {
        coefficient: 0.6,
        stocks: [
          { code: 'ALB', name: '雅宝' },
          { code: 'SQM', name: '智利矿业' },
        ],
      },
    },
  },
];

// 导出所有产业链
export const INDUSTRY_CHAINS: Record<'a' | 'hk' | 'us', IndustryChain[]> = {
  a: A_STOCK_INDUSTRIES,
  hk: HK_STOCK_INDUSTRIES,
  us: US_STOCK_INDUSTRIES,
};

// 获取所有行业列表
export function getAllIndustries(market?: 'a' | 'hk' | 'us'): IndustryChain[] {
  if (market) {
    return INDUSTRY_CHAINS[market];
  }
  return [...A_STOCK_INDUSTRIES, ...HK_STOCK_INDUSTRIES, ...US_STOCK_INDUSTRIES];
}

// 获取所有股票代码
export function getAllStockCodes(market?: 'a' | 'hk' | 'us'): string[] {
  const codes: string[] = [];
  const industries = getAllIndustries(market);
  
  for (const ind of industries) {
    for (const level of Object.values(ind.chain)) {
      for (const stock of level.stocks) {
        if (!codes.includes(stock.code)) {
          codes.push(stock.code);
        }
      }
    }
  }
  
  return codes;
}
