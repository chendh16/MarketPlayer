"""
NewsClassifier - 新闻分类器

基于规则引擎的新闻分类，包含：
- 类别分类（政治/科技/金融/军事/地缘政治等）
- 情感分析（正面/负面/中性）
- 实体提取（人物/机构/地点）
- 关键词匹配

用法:
    classifier = NewsClassifier()
    result = classifier.classify("美联储宣布降息25个基点")
    # result.category = "fed-rates"
    # result.sentiment = "negative"
    # result.keywords = ["美联储", "降息", "基准点"]
"""

import re
from dataclasses import dataclass, field
from enum import Enum
from typing import Optional

import pytest


class NewsCategory(Enum):
    """新闻类别枚举"""
    # 金融
    FED_RATES = "fed-rates"  # 美联储/利率
    MARKET = "market"  # 市场动态
    STOCKS = "stocks"  # 股票
    CRYPTO = "crypto"  # 加密货币
    COMMODITIES = "commodities"  # 大宗商品
    ECONOMY = "economy"  # 经济数据
    
    # 政治/地缘政治
    POLITICS = "politics"  # 政治
    GEOPOLITICS = "geopolitics"  # 地缘政治
    ELECTION = "election"  # 选举
    CONFLICT = "conflict"  # 冲突/战争
    
    # 科技
    TECH = "tech"  # 科技
    AI = "ai"  # 人工智能
    SEMICONDUCTOR = "semiconductor"  # 半导体
    
    # 商业
    BUSINESS = "business"  # 商业
    M&A = "merger"  # 并购
    EARNINGS = "earnings"  # 财报
    
    # 社会
    LAYOFFS = "layoffs"  # 裁员
    ENERGY = "energy"  # 能源
    HEALTH = "health"  # 健康/医疗
    
    # 其他
    OTHER = "other"


class Sentiment(Enum):
    """情感倾向"""
    POSITIVE = "positive"
    NEGATIVE = "negative"
    NEUTRAL = "neutral"


# 分类规则
CATEGORY_PATTERNS: dict[NewsCategory, list[str]] = {
    NewsCategory.FED_RATES: [
        r"fed(eral reserve)?",
        r"interest rate",
        r"货币供给",
        r"通胀",
        r"cpi|pce",
        r"quantitative tightening",
        r"qt",
        r"基准利率",
        r"lpr",
    ],
    NewsCategory.MARKET: [
        r"(stock|market) (rally|drop|surge|plunge)",
        r"wall street",
        r"dow( jones)?",
        r"nasdaq",
        r"s&p( 500)?",
        r"bull( market)?",
        r"bear( market)?",
        r"牛(市)?",
        r"熊(市)?",
    ],
    NewsCategory.STOCKS: [
        r"\b(aapl|msft|googl|amzn|meta|tsla|nvda)\b",
        r"股票代码",
        r"股价",
        r"分红",
        r"配股",
    ],
    NewsCategory.CRYPTO: [
        r"\b(btc|bitcoin|eth(ereum)?|crypto|cbdc)\b",
        r"加密货币",
        r"数字货币",
        r"区块链",
    ],
    NewsCategory.COMMODITIES: [
        r"\b(oil|gold|silver|wheat|corn)\b",
        r"大宗商品",
        r"油价",
        r"金价",
        r"期货",
    ],
    NewsCategory.ECONOMY: [
        r"gdp",
        r"unemployment",
        r"ppi|cpi",
        r"gdp",
        r"采购经理指数",
        r"pmi",
        r"非农",
    ],
    NewsCategory.POLITICS: [
        r"congress",
        r"senate",
        r"house",
        r"president",
        r"biden",
        r"trump",
        r"国会",
        r"总统",
    ],
    NewsCategory.GEOPOLITICS: [
        r"china-russia",
        r"ukraine",
        r"russia",
        r"iran",
        r"taiwan",
        r"台海",
        r"中美关系",
        r"俄乌",
    ],
    NewsCategory.ELECTION: [
        r"election",
        r"vote",
        r"poll",
        r"campaign",
        r"选举",
        r"民调",
    ],
    NewsCategory.CONFLICT: [
        r"war",
        r"military",
        r"attack",
        r"invasion",
        r"冲突",
        r"战争",
        r"军事",
    ],
    NewsCategory.TECH: [
        r"tech(nology)?",
        r"silicon valley",
        r"startup",
        r"科技",
    ],
    NewsCategory.AI: [
        r"\b(ai|chatgpt|gpt|llm|openai|anthropic)\b",
        r"人工智能",
        r"大模型",
        r"机器学习",
    ],
    NewsCategory.SEMICONDUCTOR: [
        r"semiconductor",
        r"chip",
        r"nvidia|amd|intel|tsmc",
        r"半导体",
        r"芯片",
    ],
    NewsCategory.BUSINESS: [
        r"business",
        r"company",
        r"firm",
        r"公司",
        r"企业",
    ],
    NewsCategory.M&A: [
        r"merg(e|er)|acquis",
        r"收购",
        r"并购",
        r" takeover",
    ],
    NewsCategory.EARNINGS: [
        r"earnings",
        r"revenue",
        r"profit",
        r"财报",
        r"季报",
        r"年报",
        r"业绩",
    ],
    NewsCategory.LAYOFFS: [
        r"layoff",
        r"cut jobs",
        r"fire( d)?",
        r"裁员",
        r"失业",
    ],
    NewsCategory.ENERGY: [
        r"energy",
        r"oil|gas",
        r"renewable",
        r"新能源",
        r"光伏",
        r"风电",
    ],
    NewsCategory.HEALTH: [
        r"health( care)?",
        r"virus",
        r"pandemic",
        r"covid",
        r"医疗",
        r"健康",
        r"疫苗",
    ],
}

SENTIMENT_PATTERNS: dict[Sentiment, list[str]] = {
    Sentiment.POSITIVE: [
        r"surge|rally|soar|gain",
        r"增长|上涨|上升",
        r"beat(ing)?|exceed",
        r"好消息",
        r"optimistic",
        r"bullish",
        r"升级",
        r"买入",
    ],
    Sentiment.NEGATIVE: [
        r"drop|fall|plunge|decline",
        r"下跌|下降|减少",
        r"miss(ing)?|fail",
        r"坏消息",
        r"pessimistic",
        r"bearish",
        r"降级",
        r"卖出",
        r"warning",
        r"风险",
    ],
}

# 实体模式
PERSON_PATTERNS = [
    r"\b(Biden|Trump|Musk|Zuckerberg|Powell|Gates)\b",
    r"\b[^\s]{2,4}(总统|主席|CEO|董事长)\b",
]

ORG_PATTERNS = [
    r"\b(FED|Federal Reserve|NATO|WHO|UN|IMF)\b",
    r"\b[^\s公司]*(公司|银行|基金|机构)\b",
]


@dataclass
class ClassificationResult:
    """分类结果"""
    category: NewsCategory
    sentiment: Sentiment
    confidence: float
    keywords: list[str] = field(default_factory=list)
    entities: dict[str, list[str]] = field(default_factory=dict)
    matched_patterns: list[str] = field(default_factory=list)


class NewsClassifier:
    """
    新闻分类器

    基于规则引擎的分类器，支持��
    - 类别分类
    - 情感分析
    - 实体提取
    - 关键词匹配
    """

    def __init__(self, min_confidence: float = 0.3):
        self.min_confidence = min_confidence
        self._compile_patterns()

    def _compile_patterns(self):
        """预编译正则表达式"""
        # 类别模式
        self._category_patterns: dict[NewsCategory, list[re.Pattern]] = {}
        for category, patterns in CATEGORY_PATTERNS.items():
            self._category_patterns[category] = [
                re.compile(p, re.IGNORECASE) for p in patterns
            ]

        # 情感模式
        self._sentiment_patterns: dict[Sentiment, list[re.Pattern]] = {}
        for sentiment, patterns in SENTIMENT_PATTERNS.items():
            self._sentiment_patterns[sentiment] = [
                re.compile(p, re.IGNORECASE) for p in patterns
            ]

        # 实体模式
        self._person_patterns = [re.compile(p, re.IGNORECASE) for p in PERSON_PATTERNS]
        self._org_patterns = [re.compile(p, re.IGNORECASE) for p in ORG_PATTERNS]

    def classify(self, text: str) -> ClassificationResult:
        """
        对文本进行分类

        Args:
            text: 待分类文本

        Returns:
            ClassificationResult: 分类结果
        """
        text = text.strip()
        if not text:
            return ClassificationResult(
                category=NewsCategory.OTHER,
                sentiment=Sentiment.NEUTRAL,
                confidence=0.0,
            )

        # 1. 类别分类
        category, cat_confidence, cat_patterns = self._classify_category(text)

        # 2. 情感分析
        sentiment, sent_confidence = self._classify_sentiment(text)

        # 3. 关键词提取
        keywords = self._extract_keywords(text)

        # 4. 实体提取
        entities = self._extract_entities(text)

        # 综合置信度
        confidence = max(cat_confidence, sent_confidence)

        return ClassificationResult(
            category=category,
            sentiment=sentiment,
            confidence=confidence,
            keywords=keywords,
            entities=entities,
            matched_patterns=cat_patterns,
        )

    def _classify_category(
        self, text: str
    ) -> tuple[NewsCategory, float, list[str]]:
        """分类别"""
        matches: list[tuple[NewsCategory, int]] = []
        pattern_names: list[str] = []

        for category, patterns in self._category_patterns.items():
            count = 0
            for pattern in patterns:
                if pattern.search(text):
                    count += 1
                    pattern_names.append(pattern.pattern)
            if count > 0:
                matches.append((category, count))

        if not matches:
            return NewsCategory.OTHER, 0.0, []

        # 按匹配数排序，取最高的
        matches.sort(key=lambda x: x[1], reverse=True)
        best_category, best_count = matches[0]

        # 计算置信度
        confidence = min(best_count * 0.3, 1.0)

        return best_category, confidence, pattern_names

    def _classify_sentiment(self, text: str) -> tuple[Sentiment, float]:
        """分析情感"""
        scores: dict[Sentiment, int] = {Sentiment.POSITIVE: 0, Sentiment.NEGATIVE: 0}

        for sentiment, patterns in self._sentiment_patterns.items():
            for pattern in patterns:
                if pattern.search(text):
                    scores[sentiment] += 1

        if scores[Sentiment.POSITIVE] > scores[Sentiment.NEGATIVE]:
            return Sentiment.POSITIVE, 0.7
        elif scores[Sentiment.NEGATIVE] > scores[Sentiment.POSITIVE]:
            return Sentiment.NEGATIVE, 0.7
        else:
            return Sentiment.NEUTRAL, 0.5

    def _extract_keywords(self, text: str) -> list[str]:
        """提取关键词"""
        # 简单实现：返回匹配的类别关键词
        keywords = []
        for category, patterns in self._category_patterns.items():
            for pattern in patterns:
                match = pattern.search(text)
                if match:
                    # 提取匹配的关键词
                    keywords.append(match.group(0))
        return list(set(keywords))[:10]  # 限制10个

    def _extract_entities(self, text: str) -> dict[str, list[str]]:
        """提取实体"""
        entities: dict[str, list[str]] = {
            "persons": [],
            "organizations": [],
        }

        # 提取人物
        for pattern in self._person_patterns:
            matches = pattern.findall(text)
            entities["persons"].extend(matches)

        # 提取机构
        for pattern in self._org_patterns:
            matches = pattern.findall(text)
            entities["organizations"].extend(matches)

        # 去重
        entities["persons"] = list(set(entities["persons"]))
        entities["organizations"] = list(set(entities["organizations"]))

        return entities

    def batch_classify(self, texts: list[str]) -> list[ClassificationResult]:
        """批量分类"""
        return [self.classify(text) for text in texts]


# 导出默认分类器
default_classifier = NewsClassifier()


# === 测试用例 ===
@pytest.fixture
def classifier():
    return NewsClassifier()


class TestNewsClassifier:
    """新闻分类器测试"""

    def test_fed_rates_classification(self, classifier):
        """测试美联储/利率新闻分类"""
        result = classifier.classify("Federal Reserve cuts interest rates by 25 basis points")
        assert result.category == NewsCategory.FED_RATES
        assert result.confidence > 0.3

    def test_market_classification(self, classifier):
        """测试市场新闻分类"""
        result = classifier.classify("S&P 500 rallies to new high")
        assert result.category == NewsCategory.MARKET

    def test_crypto_classification(self, classifier):
        """测试加密货币新闻分类"""
        result = classifier.classify("Bitcoin surges to $100,000")
        assert result.category == NewsCategory.CRYPTO

    def test_ai_classification(self, classifier):
        """测试AI新闻分类"""
        result = classifier.classify("OpenAI releases GPT-5")
        assert result.category == NewsCategory.AI

    def test_semiconductor_classification(self, classifier):
        """测试半导体新闻分类"""
        result = classifier.classify("NVIDIA announces new AI chips")
        assert result.category == NewsCategory.SEMICONDUCTOR

    def test_sentiment_positive(self, classifier):
        """测试正面情感"""
        result = classifier.classify("Stock market surges to record high")
        assert result.sentiment == Sentiment.POSITIVE

    def test_sentiment_negative(self, classifier):
        """测试负面情感"""
        result = classifier.classify("Market drops amid recession fears")
        assert result.sentiment == Sentiment.NEGATIVE

    def test_entity_extraction(self, classifier):
        """测试实体提取"""
        result = classifier.classify("President Biden meets with Elon Musk")
        assert len(result.entities["persons"]) > 0

    def test_geopolitics_classification(self, classifier):
        """测试地缘政治分类"""
        result = classifier.classify("China and Russia hold joint military exercises")
        assert result.category == NewsCategory.GEOPOLITICS

    def test_empty_text(self, classifier):
        """测试空文本"""
        result = classifier.classify("")
        assert result.category == NewsCategory.OTHER
        assert result.confidence == 0.0