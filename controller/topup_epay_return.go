package controller

import (
	"fmt"
	"net/http"

	"github.com/Calcium-Ion/go-epay/epay"
	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/system_setting"
	"github.com/gin-gonic/gin"
	"github.com/samber/lo"
	"github.com/shopspring/decimal"
)

func EpayReturn(c *gin.Context) {
	var params map[string]string

	if c.Request.Method == http.MethodPost {
		if err := c.Request.ParseForm(); err != nil {
			logger.LogWarn(c.Request.Context(), fmt.Sprintf("易支付 return 表单解析失败 path=%q client_ip=%s error=%q", c.Request.RequestURI, c.ClientIP(), err.Error()))
			c.Redirect(http.StatusFound, system_setting.ServerAddress+"/console/topup?pay=fail")
			return
		}
		params = lo.Reduce(lo.Keys(c.Request.PostForm), func(r map[string]string, t string, i int) map[string]string {
			r[t] = c.Request.PostForm.Get(t)
			return r
		}, map[string]string{})
	} else {
		params = lo.Reduce(lo.Keys(c.Request.URL.Query()), func(r map[string]string, t string, i int) map[string]string {
			r[t] = c.Request.URL.Query().Get(t)
			return r
		}, map[string]string{})
	}

	if len(params) == 0 {
		c.Redirect(http.StatusFound, system_setting.ServerAddress+"/console/topup?pay=fail")
		return
	}

	client := GetEpayClient()
	if client == nil {
		c.Redirect(http.StatusFound, system_setting.ServerAddress+"/console/topup?pay=fail")
		return
	}

	verifyInfo, err := client.Verify(params)
	if err != nil || !verifyInfo.VerifyStatus {
		logger.LogWarn(c.Request.Context(), fmt.Sprintf("易支付 return 验签失败 path=%q client_ip=%s error=%v", c.Request.RequestURI, c.ClientIP(), err))
		c.Redirect(http.StatusFound, system_setting.ServerAddress+"/console/topup?pay=fail")
		return
	}

	if verifyInfo.TradeStatus != epay.StatusTradeSuccess {
		c.Redirect(http.StatusFound, system_setting.ServerAddress+"/console/topup?pay=pending")
		return
	}

	if err = completeEpayTopUpByVerifyInfo(verifyInfo.ServiceTradeNo, verifyInfo.Type, c.ClientIP()); err != nil {
		logger.LogError(c.Request.Context(), fmt.Sprintf("易支付 return 处理失败 trade_no=%s callback_type=%s client_ip=%s error=%q", verifyInfo.ServiceTradeNo, verifyInfo.Type, c.ClientIP(), err.Error()))
		c.Redirect(http.StatusFound, system_setting.ServerAddress+"/console/topup?pay=fail")
		return
	}

	c.Redirect(http.StatusFound, system_setting.ServerAddress+"/console/topup?pay=success")
}

func completeEpayTopUpByVerifyInfo(serviceTradeNo string, actualType string, callerIp string) error {
	if serviceTradeNo == "" {
		return fmt.Errorf("empty trade no")
	}

	LockOrder(serviceTradeNo)
	defer UnlockOrder(serviceTradeNo)

	topUp := model.GetTopUpByTradeNo(serviceTradeNo)
	if topUp == nil {
		return fmt.Errorf("充值订单不存在")
	}
	if topUp.PaymentProvider != model.PaymentProviderEpay {
		return fmt.Errorf("订单支付网关不匹配: %s", topUp.PaymentProvider)
	}
	if topUp.Status != common.TopUpStatusPending {
		return nil
	}

	if topUp.PaymentMethod != actualType {
		topUp.PaymentMethod = actualType
	}
	topUp.Status = common.TopUpStatusSuccess
	if err := topUp.Update(); err != nil {
		return err
	}

	dAmount := decimal.NewFromInt(int64(topUp.Amount))
	dQuotaPerUnit := decimal.NewFromFloat(common.QuotaPerUnit)
	quotaToAdd := int(dAmount.Mul(dQuotaPerUnit).IntPart())
	if err := model.IncreaseUserQuota(topUp.UserId, quotaToAdd, true); err != nil {
		return err
	}

	model.RecordTopupLog(topUp.UserId, fmt.Sprintf("使用在线充值成功，充值金额: %v，支付金额：%f", logger.LogQuota(quotaToAdd), topUp.Money), callerIp, topUp.PaymentMethod, "epay")
	return nil
}
