-- 마비노기 체크리스트 동기화용 테이블 (예시: MySQL/MariaDB)
-- sync_id(고유 식별자)별로 전체 데이터를 JSON으로 저장

CREATE TABLE mobinogi_checklist (
    sync_id VARCHAR(8) PRIMARY KEY COMMENT '고유 동기화 ID(UUID 등)',
    data_json JSON NOT NULL COMMENT '전체 체크리스트 데이터(JSON)',
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '최종 수정일'
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '생성일',
);

-- 인덱스 및 기타 옵션은 필요에 따라 추가
-- data_json 예시: {
--   characters: [...],
--   userDailyTasks: [...],
--   userWeeklyTasks: [...],
--   removedDailyTaskIds: [...],
--   removedWeeklyTaskIds: [...],
--   lastReset: { daily: ..., weekly: ... }
-- }
