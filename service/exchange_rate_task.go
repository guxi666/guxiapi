package service

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/operation_setting"
)

type exchangeRateResponse struct {
	Result string             `json:"result"`
	Success bool              `json:"success"`
	Rates  map[string]float64 `json:"rates"`
}

func StartUSDExchangeRateSyncTask() {
	go func() {
		common.SysLog("usd exchange rate sync task started")
		for {
			if operation_setting.USDExchangeRateAutoUpdateEnabled {
				if rate, err := fetchUSDToCNYRate(); err != nil {
					common.SysError("failed to sync USD exchange rate: " + err.Error())
				} else if rate > 0 {
					rateStr := strconv.FormatFloat(rate, 'f', 6, 64)
					if err := model.UpdateOption("USDExchangeRate", rateStr); err != nil {
						common.SysError("failed to persist USD exchange rate: " + err.Error())
					} else {
						// 同步将充值价格保持为最新美元汇率，避免汇率与支付金额换算分离。
						if err := model.UpdateOption("Price", rateStr); err != nil {
							common.SysError("failed to sync topup price with USD exchange rate: " + err.Error())
						}
						common.SysLog(fmt.Sprintf("USDExchangeRate synced: %.6f", rate))
					}
				}
			}

			minutes := operation_setting.USDExchangeRateSyncMinutes
			if minutes <= 0 {
				minutes = 30
			}
			time.Sleep(time.Duration(minutes) * time.Minute)
		}
	}()
}

func fetchUSDToCNYRate() (float64, error) {
	sources := []string{
		"https://open.er-api.com/v6/latest/USD",
		"https://api.exchangerate-api.com/v4/latest/USD",
	}
	var lastErr error
	for _, endpoint := range sources {
		rate, err := fetchRateFromEndpoint(endpoint)
		if err == nil && rate > 0 {
			return rate, nil
		}
		lastErr = err
	}
	if lastErr == nil {
		lastErr = fmt.Errorf("all exchange rate providers failed")
	}
	return 0, lastErr
}

func fetchRateFromEndpoint(endpoint string) (float64, error) {
	client := GetHttpClient()
	if client == nil {
		client = http.DefaultClient
	}

	ctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return 0, err
	}
	resp, err := client.Do(req)
	if err != nil {
		return 0, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return 0, fmt.Errorf("unexpected status %d from %s", resp.StatusCode, endpoint)
	}

	raw, err := io.ReadAll(resp.Body)
	if err != nil {
		return 0, err
	}

	var payload exchangeRateResponse
	if err := json.Unmarshal(raw, &payload); err != nil {
		return 0, err
	}
	if payload.Rates == nil {
		return 0, fmt.Errorf("rates not found in %s", endpoint)
	}
	rate := payload.Rates["CNY"]
	if rate <= 0 {
		return 0, fmt.Errorf("CNY rate missing in %s", endpoint)
	}
	return rate, nil
}
