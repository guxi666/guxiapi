package controller

import (
	"encoding/hex"
	"errors"
	"net/http"
	"strconv"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"

	"github.com/gin-gonic/gin"
)

const (
	defaultLotteryTitle    = "幸运抽奖"
	defaultLotterySubtitle = "每个用户 / 设备 / IP 仅可参与一次"
)

type lotteryConfigResponse struct {
	Enabled  bool   `json:"enabled"`
	Title    string `json:"title"`
	Subtitle string `json:"subtitle"`
}

type lotteryConfigUpdateRequest struct {
	Enabled  *bool  `json:"enabled"`
	Title    string `json:"title"`
	Subtitle string `json:"subtitle"`
}

type lotteryDrawRequest struct {
	DeviceID string `json:"device_id"`
}

func GetLotteryConfig(c *gin.Context) {
	cfg := readLotteryConfig()
	hasDrawn, err := model.HasUserDrawnLottery(c.GetInt("id"))
	if err != nil {
		common.ApiError(c, err)
		return
	}

	prizes, err := model.GetAllLotteryPrizes()
	if err != nil {
		common.ApiError(c, err)
		return
	}
	enabledPrizes := make([]*model.LotteryPrize, 0, len(prizes))
	for _, p := range prizes {
		if p.Enabled && (p.Stock == 0 || p.Stock > 0) {
			enabledPrizes = append(enabledPrizes, p)
		}
	}

	common.ApiSuccess(c, gin.H{
		"config":    cfg,
		"has_drawn": hasDrawn,
		"prizes":    enabledPrizes,
	})
}

func LotteryDraw(c *gin.Context) {
	cfg := readLotteryConfig()
	if !cfg.Enabled {
		common.ApiErrorMsg(c, "抽奖功能暂未开启")
		return
	}

	var req lotteryDrawRequest
	_ = c.ShouldBindJSON(&req)
	deviceID := strings.TrimSpace(req.DeviceID)
	if deviceID == "" {
		deviceID = strings.TrimSpace(c.GetHeader("X-Device-Id"))
	}
	if len(deviceID) < 8 {
		common.ApiErrorMsg(c, "设备标识无效，请刷新页面后重试")
		return
	}
	deviceHash := hex.EncodeToString(common.Sha256Raw([]byte(deviceID)))
	clientIP := strings.TrimSpace(c.ClientIP())

	result, err := model.DrawLottery(c.GetInt("id"), clientIP, deviceHash)
	if err != nil {
		if errors.Is(err, model.ErrLotteryAlreadyDrawn) {
			common.ApiErrorMsg(c, "你已参与过抽奖，本账号/设备/IP 不能重复抽奖")
			return
		}
		if errors.Is(err, model.ErrLotteryNoPrize) {
			common.ApiErrorMsg(c, "奖池已空，请联系管理员补充奖品")
			return
		}
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, result)
}

func AdminGetLotteryConfig(c *gin.Context) {
	common.ApiSuccess(c, readLotteryConfig())
}

func AdminUpdateLotteryConfig(c *gin.Context) {
	var req lotteryConfigUpdateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": "参数错误",
		})
		return
	}

	if req.Enabled != nil {
		if err := model.UpdateOption("LotteryEnabled", common.Interface2String(*req.Enabled)); err != nil {
			common.ApiError(c, err)
			return
		}
	}
	if strings.TrimSpace(req.Title) != "" {
		if err := model.UpdateOption("LotteryTitle", strings.TrimSpace(req.Title)); err != nil {
			common.ApiError(c, err)
			return
		}
	}
	if strings.TrimSpace(req.Subtitle) != "" {
		if err := model.UpdateOption("LotterySubtitle", strings.TrimSpace(req.Subtitle)); err != nil {
			common.ApiError(c, err)
			return
		}
	}
	common.ApiSuccess(c, readLotteryConfig())
}

func AdminGetLotteryPrizes(c *gin.Context) {
	prizes, err := model.GetAllLotteryPrizes()
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, prizes)
}

func AdminCreateLotteryPrize(c *gin.Context) {
	var prize model.LotteryPrize
	if err := c.ShouldBindJSON(&prize); err != nil {
		common.ApiError(c, err)
		return
	}
	if strings.TrimSpace(prize.Name) == "" {
		common.ApiErrorMsg(c, "奖品名称不能为空")
		return
	}
	if prize.Weight <= 0 {
		prize.Weight = 1
	}
	if prize.Stock < 0 {
		common.ApiErrorMsg(c, "库存不能为负数")
		return
	}
	if err := prize.Insert(); err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, prize)
}

func AdminUpdateLotteryPrize(c *gin.Context) {
	var req model.LotteryPrize
	if err := c.ShouldBindJSON(&req); err != nil {
		common.ApiError(c, err)
		return
	}
	if req.Id == 0 {
		common.ApiErrorMsg(c, "奖品 ID 无效")
		return
	}

	prize, err := model.GetLotteryPrizeById(req.Id)
	if err != nil {
		common.ApiError(c, err)
		return
	}

	if strings.TrimSpace(req.Name) == "" {
		common.ApiErrorMsg(c, "奖品名称不能为空")
		return
	}
	if req.Stock < 0 {
		common.ApiErrorMsg(c, "库存不能为负数")
		return
	}

	prize.Name = strings.TrimSpace(req.Name)
	prize.Description = strings.TrimSpace(req.Description)
	prize.Weight = req.Weight
	prize.Quota = req.Quota
	prize.Stock = req.Stock
	prize.Color = strings.TrimSpace(req.Color)
	prize.Enabled = req.Enabled
	prize.SortOrder = req.SortOrder

	if err := prize.Update(); err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, prize)
}

func AdminDeleteLotteryPrize(c *gin.Context) {
	prizeID := common.String2Int(c.Param("id"))
	if prizeID <= 0 {
		prizeID, _ = strconv.Atoi(strings.TrimSpace(c.Query("id")))
	}
	if prizeID <= 0 {
		common.ApiErrorMsg(c, "奖品 ID 无效")
		return
	}
	if err := model.DeleteLotteryPrizeById(prizeID); err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, nil)
}

func AdminGetLotteryRecords(c *gin.Context) {
	pageInfo := common.GetPageQuery(c)
	records, total, err := model.GetLotteryRecords(pageInfo)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	pageInfo.SetItems(records)
	pageInfo.SetTotal(int(total))
	common.ApiSuccess(c, pageInfo)
}

func readLotteryConfig() lotteryConfigResponse {
	common.OptionMapRWMutex.RLock()
	defer common.OptionMapRWMutex.RUnlock()

	title := strings.TrimSpace(common.OptionMap["LotteryTitle"])
	if title == "" {
		title = defaultLotteryTitle
	}
	subtitle := strings.TrimSpace(common.OptionMap["LotterySubtitle"])
	if subtitle == "" {
		subtitle = defaultLotterySubtitle
	}
	enabled := strings.EqualFold(strings.TrimSpace(common.OptionMap["LotteryEnabled"]), "true")

	return lotteryConfigResponse{
		Enabled:  enabled,
		Title:    title,
		Subtitle: subtitle,
	}
}
