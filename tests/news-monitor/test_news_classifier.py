"""
NewsClassifier 单元测试
"""

import pytest

from agents.news_monitor.news_classifier import (
    NewsClassifier,
    NewsCategory,
    Sentiment,
    CATEGORY_PATTERNS,
    SENTIMENT_PATTERNS,
    ClassificationResult,
)


class TestNewsCategory:
    """新闻类别测试"""

    def test_category_enum_values(self):
        """类别枚举值"""
        assert NewsCategory.FED_RATES.value == "fed-rates"
        assert NewsCategory.MARKET.value == "market"
        assert NewsCategory.CRYPTO.value == "crypto"
        assert NewsCategory.AI.value == "ai"
        assert NewsCategory.TECH.value == "tech"

    def test_all_categories_defined(self):
        """所有类别都定义"""
        categories = list(NewsCategory)
        assert len(categories) >= 18


class TestSentiment:
    """情感测试"""

    def test_sentiment_enum_values(self):
        """情感枚举值"""
        assert Sentiment.POSITIVE.value == "positive"
        assert Sentiment.NEGATIVE.value == "negative"
        assert Sentiment.NEUTRAL.value == "neutral"


class TestNewsClassifier:
    """新闻分类器测试"""

    def test_initialization(self):
        """初始化"""
        classifier = NewsClassifier()
        assert classifier.min_confidence == 0.3
        assert classifier._category_patterns is not None
        assert classifier._sentiment_patterns is not None

    def test_empty_text(self):
        """空文本"""
        classifier = NewsClassifier()
        result = classifier.classify("")
        
        assert result.category == NewsCategory.OTHER
        assert result.confidence == 0.0

    def test_fed_rates_classification(self):
        """美联储/利率新闻"""
        classifier = NewsClassifier()
        
        result = classifier.classify("Federal Reserve cuts interest rates by 25 basis points")
        
        assert result.category == NewsCategory.FED_RATES
        assert result.confidence > 0.3

    def test_fed_rates_chinese(self):
        """美联储/利率中文"""
        classifier = NewsClassifier()
        
        result = classifier.classify("美联储宣布降息25个基点")
        
        assert result.category == NewsCategory.FED_RATES

    def test_market_rally(self):
        """市场上涨"""
        classifier = NewsClassifier()
        
        result = classifier.classify("S&P 500 rallies to new record high")
        
        assert result.category == NewsCategory.MARKET

    def test_market_bull(self):
        """牛市"""
        classifier = NewsClassifier()
        
        result = classifier.classify("Bull market continues with strong gains")
        
        assert result.category == NewsCategory.MARKET

    def test_market_bear(self):
        """熊市"""
        classifier = NewsClassifier()
        
        result = classifier.classify("Bear market fears grow as stocks tumble")
        
        assert result.category == NewsCategory.MARKET

    def test_crypto_bitcoin(self):
        """比特币"""
        classifier = NewsClassifier()
        
        result = classifier.classify("Bitcoin surges to $100,000 milestone")
        
        assert result.category == NewsCategory.CRYPTO

    def test_crypto_ethereum(self):
        """以太坊"""
        classifier = NewsClassifier()
        
        result = classifier.classify("Ethereum upgrade goes live")
        
        assert result.category == NewsCategory.CRYPTO

    def test_ai_chatgpt(self):
        """ChatGPT"""
        classifier = NewsClassifier()
        
        result = classifier.classify("OpenAI releases GPT-5 with new capabilities")
        
        assert result.category == NewsCategory.AI

    def test_ai_llm(self):
        """LLM"""
        classifier = NewsClassifier()
        
        result = classifier.classify("New LLM outperforms GPT-4")
        
        assert result.category == NewsCategory.AI

    def test_semiconductor_nvidia(self):
        """英伟达"""
        classifier = NewsClassifier()
        
        result = classifier.classify("NVIDIA announces new AI chip")
        
        assert result.category == NewsCategory.SEMICONDUCTOR

    def test_semiconductor_tsMC(self):
        """台积电"""
        classifier = NewsClassifier()
        
        result = classifier.classify("TSMC expands advanced chip production")
        
        assert result.category == NewsCategory.SEMICONDUCTOR

    def test_semiconductor_intel(self):
        """英特尔"""
        classifier = NewsClassifier()
        
        result = classifier.classify("Intel releases new processor")
        
        assert result.category == NewsCategory.SEMICONDUCTOR

    def test_geopolitics_china_russia(self):
        """中俄关系"""
        classifier = NewsClassifier()
        
        result = classifier.classify("China and Russia hold joint military exercises")
        
        assert result.category == NewsCategory.GEOPOLITICS

    def test_geopolitics_ukraine(self):
        """俄乌"""
        classifier = NewsClassifier()
        
        result = classifier.classify("Ukraine war update: Russian forces advance")
        
        assert result.category == NewsCategory.GEOPOLITICS

    def test_geopolitics_taiwan(self):
        """台海"""
        classifier = NewsClassifier()
        
        result = classifier.classify("Taiwan tensions rise amid military drills")
        
        assert result.category == NewsCategory.GEOPOLITICS

    def test_geopolitics_taiwan_chinese(self):
        """台海中文"""
        classifier = NewsClassifier()
        
        result = classifier.classify("台海局势紧张解放军举行军演")
        
        assert result.category == NewsCategory.GEOPOLITICS

    def test_conflict_war(self):
        """冲突"""
        classifier = NewsClassifier()
        
        result = classifier.classify("Military conflict escalates in region")
        
        assert result.category == NewsCategory.CONFLICT

    def test_conflict_attack(self):
        """袭击"""
        classifier = NewsClassifier()
        
        result = classifier.classify("Terrorist attack reported in capital")
        
        assert result.category == NewsCategory.CONFLICT

    def test_politics_biden(self):
        """拜登"""
        classifier = NewsClassifier()
        
        result = classifier.classify("President Biden announces new policy")
        
        assert result.category == NewsCategory.POLITICS

    def test_politics_trump(self):
        """特朗普"""
        classifier = NewsClassifier()
        
        result = classifier.classify("Trump campaign draws large crowds")
        
        assert result.category == NewsCategory.POLITICS

    def test_layoffs(self):
        """裁员"""
        classifier = NewsClassifier()
        
        result = classifier.classify("Tech company lays off 10,000 employees")
        
        assert result.category == NewsCategory.LAYOFFS

    def test_layoffs_chinese(self):
        """裁员中文"""
        classifier = NewsClassifier()
        
        result = classifier.classify("科技巨头裁员万人")
        
        assert result.category == NewsCategory.LAYOFFS

    def test_earnings(self):
        """财报"""
        classifier = NewsClassifier()
        
        result = classifier.classify("Apple earnings beat expectations")
        
        assert result.category == NewsCategory.EARNINGS

    def test_mergers(self):
        """并购"""
        classifier = NewsClassifier()
        
        result = classifier.classify("Microsoft acquires startup for $5 billion")
        
        assert result.category == NewsCategory.M&A

    def test_energy_oil(self):
        """石油"""
        classifier = NewsClassifier()
        
        result = classifier.classify("Oil prices rise on supply concerns")
        
        assert result.category == NewsCategory.ENERGY

    def test_energy_renewable(self):
        """新能源"""
        classifier = NewsClassifier()
        
        result = classifier.classify("Renewable energy investments surge")
        
        assert result.category == NewsCategory.ENERGY

    def test_commodities_gold(self):
        """黄金"""
        classifier = NewsClassifier()
        
        result = classifier.classify("Gold hits record high")
        
        assert result.category == NewsCategory.COMMODITIES

    def test_commodities_oil(self):
        """原油"""
        classifier = NewsClassifier()
        
        result = classifier.classify("Crude oil futures climb 5%")
        
        assert result.category == NewsCategory.COMMODITIES

    def test_sentiment_positive(self):
        """正面情感"""
        classifier = NewsClassifier()
        
        result = classifier.classify("Market surges to record high on good news")
        
        assert result.sentiment == Sentiment.POSITIVE

    def test_sentiment_positive_beats(self):
        """超预期"""
        classifier = NewsClassifier()
        
        result = classifier.classify("Company earnings beat expectations")
        
        assert result.sentiment == Sentiment.POSITIVE

    def test_sentiment_negative(self):
        """负面情感"""
        classifier = NewsClassifier()
        
        result = classifier.classify("Market drops amid recession fears")
        
        assert result.sentiment == Sentiment.NEGATIVE

    def test_sentiment_negative_warning(self):
        """风险警告"""
        classifier = NewsClassifier()
        
        result = classifier.classify("Analyst issues warning on stock")
        
        assert result.sentiment == Sentiment.NEGATIVE

    def test_sentiment_neutral(self):
        """中性"""
        classifier = NewsClassifier()
        
        result = classifier.classify("Federal Reserve holds meeting")
        
        assert result.sentiment == Sentiment.NEUTRAL

    def test_entity_extraction_persons(self):
        """人物提取"""
        classifier = NewsClassifier()
        
        result = classifier.classify("President Biden meets with Elon Musk at White House")
        
        assert len(result.entities["persons"]) > 0

    def test_entity_extraction_biden(self):
        """拜登提取"""
        classifier = NewsClassifier()
        
        result = classifier.classify("President Biden announces policy")
        
        # 应提取到 President/Biden
        assert "Biden" in str(result.entities) or "President" in str(result.entities)

    def test_entity_extraction_orgs(self):
        """机构提取"""
        classifier = NewsClassifier()
        
        result = classifier.classify("FED raises interest rates, NATO condemns action")
        
        assert len(result.entities["organizations"]) > 0

    def test_keywords_extraction(self):
        """关键词提取"""
        classifier = NewsClassifier()
        
        result = classifier.classify("Federal Reserve cuts interest rates by 25 basis points")
        
        assert len(result.keywords) > 0

    def test_batch_classify(self):
        """批量分类"""
        classifier = NewsClassifier()
        
        texts = [
            "Federal Reserve cuts rates",
            "Bitcoin surges",
            "NVIDIA new chip",
        ]
        
        results = classifier.batch_classify(texts)
        
        assert len(results) == 3
        assert all(isinstance(r, ClassificationResult) for r in results)

    def test_multiple_categories(self):
        """多类别匹配"""
        classifier = NewsClassifier()
        
        # 同时包含 market 和 stocks 的新闻
        result = classifier.classify("S&P 500 stocks rally on Fed decision")
        
        # 应该匹配到 MARKET
        assert result.category == NewsCategory.MARKET

    def test_unknown_category(self):
        """未知类别"""
        classifier = NewsClassifier()
        
        result = classifier.classify("Random unrelated news story here")
        
        assert result.category == NewsCategory.OTHER


# 准确率测试
class TestClassificationAccuracy:
    """分类准确率测试"""

    @pytest.fixture
    def classifier(self):
        return NewsClassifier()

    def test_finance_category_accuracy(self, classifier):
        """金融类别准确率"""
        test_cases = [
            ("Fed rate decision due this week", NewsCategory.FED_RATES),
            ("S&P 500 closes higher", NewsCategory.MARKET),
            ("AAPL stock splits", NewsCategory.STOCKS),
            ("Bitcoin price analysis", NewsCategory.CRYPTO),
            ("Gold demand rises", NewsCategory.COMMODITIES),
        ]
        
        correct = 0
        for text, expected in test_cases:
            result = classifier.classify(text)
            if result.category == expected:
                correct += 1
        
        accuracy = correct / len(test_cases)
        assert accuracy >= 0.8, f"Finance accuracy: {accuracy}"

    def test_tech_category_accuracy(self, classifier):
        """科技类别准确率"""
        test_cases = [
            ("OpenAI releases new model", NewsCategory.AI),
            ("NVIDIA earnings beat", NewsCategory.SEMICONDUCTOR),
            ("Tech sector outlook", NewsCategory.TECH),
        ]
        
        correct = 0
        for text, expected in test_cases:
            result = classifier.classify(text)
            if result.category == expected:
                correct += 1
        
        accuracy = correct / len(test_cases)
        assert accuracy >= 0.8, f"Tech accuracy: {accuracy}"

    def test_geo_category_accuracy(self, classifier):
        """地缘政治准确率"""
        test_cases = [
            ("Russia Ukraine war update", NewsCategory.GEOPOLITICS),
            ("Taiwan strait tensions", NewsCategory.GEOPOLITICS),
            ("China US relations", NewsCategory.GEOPOLITICS),
        ]
        
        correct = 0
        for text, expected in test_cases:
            result = classifier.classify(text)
            if result.category == expected:
                correct += 1
        
        accuracy = correct / len(test_cases)
        assert accuracy >= 0.8, f"Geo accuracy: {accuracy}"

    def test_sentiment_accuracy(self, classifier):
        """情感分析准确率"""
        test_cases = [
            ("Market surges to record high", Sentiment.POSITIVE),
            ("Stocks rally on good news", Sentiment.POSITIVE),
            ("Market drops sharply", Sentiment.NEGATIVE),
            ("Recession fears grow", Sentiment.NEGATIVE),
            ("Fed holds meeting", Sentiment.NEUTRAL),
        ]
        
        correct = 0
        for text, expected in test_cases:
            result = classifier.classify(text)
            if result.sentiment == expected:
                correct += 1
        
        accuracy = correct / len(test_cases)
        assert accuracy >= 0.8, f"Sentiment accuracy: {accuracy}"


# 运行测试
if __name__ == "__main__":
    pytest.main([__file__, "-v"])