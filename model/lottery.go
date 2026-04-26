package model

import (
	crand "crypto/rand"
	"errors"
	"fmt"
	"math/big"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/logger"
	"gorm.io/gorm"
)

var (
	ErrLotteryAlreadyDrawn = errors.New("lottery.already_drawn")
	ErrLotteryNoPrize      = errors.New("lottery.no_prize")
)

type LotteryPrize struct {
	Id          int            `json:"id"`
	Name        string         `json:"name" gorm:"type:varchar(128);not null"`
	Description string         `json:"description" gorm:"type:varchar(255);default:''"`
	Weight      float64        `json:"weight" gorm:"default:1"`
	Quota       int            `json:"quota" gorm:"default:0"` // 奖励额度（token quota）
	Stock       int            `json:"stock" gorm:"default:0"` // 0 表示不限量
	Color       string         `json:"color" gorm:"type:varchar(32);default:''"`
	Enabled     bool           `json:"enabled" gorm:"default:true"`
	SortOrder   int            `json:"sort_order" gorm:"default:0"`
	CreatedTime int64          `json:"created_time" gorm:"bigint"`
	UpdatedTime int64          `json:"updated_time" gorm:"bigint"`
	DeletedAt   gorm.DeletedAt `json:"-" gorm:"index"`
}

type LotteryRecord struct {
	Id          int            `json:"id"`
	UserId      int            `json:"user_id" gorm:"index;uniqueIndex:idx_lottery_user_once"`
	ClientIP    string         `json:"client_ip" gorm:"type:varchar(64);index;uniqueIndex:idx_lottery_ip_once"`
	DeviceHash  string         `json:"device_hash" gorm:"type:char(64);index;uniqueIndex:idx_lottery_device_once"`
	PrizeId     int            `json:"prize_id" gorm:"index"`
	PrizeName   string         `json:"prize_name" gorm:"type:varchar(128)"`
	PrizeQuota  int            `json:"prize_quota"`
	CreatedTime int64          `json:"created_time" gorm:"bigint"`
	DeletedAt   gorm.DeletedAt `json:"-" gorm:"index"`
}

type LotteryDrawResult struct {
	Record *LotteryRecord `json:"record"`
	Prize  *LotteryPrize  `json:"prize"`
}

func (p *LotteryPrize) Insert() error {
	now := common.GetTimestamp()
	p.CreatedTime = now
	p.UpdatedTime = now
	if p.Weight <= 0 {
		p.Weight = 1
	}
	return DB.Create(p).Error
}

func (p *LotteryPrize) Update() error {
	p.UpdatedTime = common.GetTimestamp()
	if p.Weight <= 0 {
		p.Weight = 1
	}
	return DB.Model(p).
		Select("name", "description", "weight", "quota", "stock", "color", "enabled", "sort_order", "updated_time").
		Updates(p).Error
}

func GetLotteryPrizeById(id int) (*LotteryPrize, error) {
	if id == 0 {
		return nil, errors.New("id 为空")
	}
	var prize LotteryPrize
	if err := DB.First(&prize, "id = ?", id).Error; err != nil {
		return nil, err
	}
	return &prize, nil
}

func DeleteLotteryPrizeById(id int) error {
	if id == 0 {
		return errors.New("id 为空")
	}
	return DB.Delete(&LotteryPrize{}, "id = ?", id).Error
}

func GetAllLotteryPrizes() ([]*LotteryPrize, error) {
	var prizes []*LotteryPrize
	err := DB.Order("sort_order asc, id asc").Find(&prizes).Error
	return prizes, err
}

func GetEnabledLotteryPrizes(tx *gorm.DB) ([]*LotteryPrize, error) {
	var prizes []*LotteryPrize
	err := tx.
		Where("enabled = ? AND (stock = 0 OR stock > 0)", true).
		Order("sort_order asc, id asc").
		Find(&prizes).Error
	return prizes, err
}

func HasUserDrawnLottery(userId int) (bool, error) {
	if userId == 0 {
		return false, errors.New("无效用户")
	}
	var cnt int64
	if err := DB.Model(&LotteryRecord{}).Where("user_id = ?", userId).Count(&cnt).Error; err != nil {
		return false, err
	}
	return cnt > 0, nil
}

func DrawLottery(userId int, clientIP string, deviceHash string) (*LotteryDrawResult, error) {
	if userId == 0 {
		return nil, errors.New("无效用户")
	}
	if clientIP == "" || deviceHash == "" {
		return nil, errors.New("设备信息不完整")
	}

	var selectedPrize *LotteryPrize
	record := &LotteryRecord{}

	err := DB.Transaction(func(tx *gorm.DB) error {
		var already LotteryRecord
		err := tx.
			Where("user_id = ? OR client_ip = ? OR device_hash = ?", userId, clientIP, deviceHash).
			First(&already).Error
		if err == nil {
			return ErrLotteryAlreadyDrawn
		}
		if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
			return err
		}

		prizes, err := GetEnabledLotteryPrizes(tx)
		if err != nil {
			return err
		}
		if len(prizes) == 0 {
			return ErrLotteryNoPrize
		}

		candidates := prizes
		for len(candidates) > 0 {
			selectedPrize = pickPrizeByWeight(candidates)
			if selectedPrize == nil {
				return ErrLotteryNoPrize
			}

			if selectedPrize.Stock == 0 {
				break
			}
			updateResult := tx.Model(&LotteryPrize{}).
				Where("id = ? AND stock > 0", selectedPrize.Id).
				Update("stock", gorm.Expr("stock - 1"))
			if updateResult.Error != nil {
				return updateResult.Error
			}
			if updateResult.RowsAffected > 0 {
				selectedPrize.Stock--
				break
			}

			// 并发下奖品可能被抢完，移除该奖品后重选
			next := make([]*LotteryPrize, 0, len(candidates)-1)
			for _, p := range candidates {
				if p.Id != selectedPrize.Id {
					next = append(next, p)
				}
			}
			candidates = next
			selectedPrize = nil
		}

		if selectedPrize == nil {
			return ErrLotteryNoPrize
		}

		if selectedPrize.Stock > 0 {
			// stock 已在上面扣减，确保本地是最新值
			if err := tx.First(selectedPrize, "id = ?", selectedPrize.Id).Error; err != nil {
				return err
			}
		}

		if selectedPrize.Quota > 0 {
			if err := tx.Model(&User{}).
				Where("id = ?", userId).
				Update("quota", gorm.Expr("quota + ?", selectedPrize.Quota)).Error; err != nil {
				return err
			}
		}

		record.UserId = userId
		record.ClientIP = clientIP
		record.DeviceHash = deviceHash
		record.PrizeId = selectedPrize.Id
		record.PrizeName = selectedPrize.Name
		record.PrizeQuota = selectedPrize.Quota
		record.CreatedTime = common.GetTimestamp()

		if err := tx.Create(record).Error; err != nil {
			return err
		}
		return nil
	})

	if err != nil {
		return nil, err
	}

	if selectedPrize.Quota > 0 {
		RecordLog(userId, LogTypeTopup, fmt.Sprintf("抽奖获得奖励 %s", logger.LogQuota(selectedPrize.Quota)))
	}

	return &LotteryDrawResult{
		Record: record,
		Prize:  selectedPrize,
	}, nil
}

func pickPrizeByWeight(prizes []*LotteryPrize) *LotteryPrize {
	totalWeight := 0.0
	for _, prize := range prizes {
		if prize == nil || !prize.Enabled {
			continue
		}
		if prize.Stock < 0 {
			continue
		}
		weight := prize.Weight
		if weight <= 0 {
			weight = 1
		}
		totalWeight += weight
	}
	if totalWeight <= 0 {
		return nil
	}

	target := secureRandomFloat(totalWeight)
	current := 0.0
	for _, prize := range prizes {
		if prize == nil || !prize.Enabled {
			continue
		}
		if prize.Stock < 0 {
			continue
		}
		weight := prize.Weight
		if weight <= 0 {
			weight = 1
		}
		current += weight
		if target <= current {
			return prize
		}
	}
	return prizes[len(prizes)-1]
}

func secureRandomFloat(max float64) float64 {
	if max <= 0 {
		return 0
	}
	// 1e9 精度已足够抽奖场景
	n, err := crand.Int(crand.Reader, big.NewInt(1_000_000_000))
	if err != nil {
		return max / 2
	}
	ratio := float64(n.Int64()) / 1_000_000_000
	return ratio * max
}

func GetLotteryRecords(pageInfo *common.PageInfo) ([]*LotteryRecord, int64, error) {
	var records []*LotteryRecord
	var total int64

	tx := DB.Begin()
	if tx.Error != nil {
		return nil, 0, tx.Error
	}
	defer func() {
		if r := recover(); r != nil {
			tx.Rollback()
		}
	}()

	if err := tx.Model(&LotteryRecord{}).Count(&total).Error; err != nil {
		tx.Rollback()
		return nil, 0, err
	}
	if err := tx.Order("id desc").
		Limit(pageInfo.GetPageSize()).
		Offset(pageInfo.GetStartIdx()).
		Find(&records).Error; err != nil {
		tx.Rollback()
		return nil, 0, err
	}

	if err := tx.Commit().Error; err != nil {
		return nil, 0, err
	}
	return records, total, nil
}
