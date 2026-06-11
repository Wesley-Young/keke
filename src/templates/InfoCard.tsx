export interface InfoCardCurrency {
  shell: number;
  stamina: number;
  charm: number;
  bomb: number;
}

export interface InfoCardDick {
  registered: boolean;
  lengthText?: string;
}

export interface InfoCardFishingItem {
  emoji: string;
  count: number;
}

export interface InfoCardFishingInventory {
  rod: number;
  items: readonly InfoCardFishingItem[];
}

export interface InfoCardProps {
  nickname: string;
  userId: number | string;
  currency: InfoCardCurrency;
  dick: InfoCardDick;
  fishing: InfoCardFishingInventory;
}

const currencyLabels: readonly {
  key: keyof InfoCardCurrency;
  label: string;
  unit: string;
}[] = [
  { key: 'shell', label: '微壳', unit: '' },
  { key: 'stamina', label: '体力', unit: '' },
  { key: 'charm', label: '魅力', unit: '' },
  { key: 'bomb', label: '炸弹', unit: '枚' },
];

function repeatString(str: string, count: number): string {
  let result = '';
  for (let i = 0; i < count; i++) {
    result += str;
  }
  return result;
}

export default function InfoCard({
  nickname,
  userId,
  currency,
  dick,
  fishing,
}: InfoCardProps) {
  const fishingInventory = fishing.items
    .map((item) => repeatString(item.emoji, item.count))
    .join('');

  return (
    <div
      style={{
        width: 720,
        backgroundColor: '#fff',
        color: '#1f2933',
        fontFamily: 'Inter, Noto Sans SC',
        padding: 28,
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          borderBottom: '3px solid #24313d',
          paddingBottom: 18,
        }}
      >
        <div>
          <div
            style={{
              fontSize: 17,
              color: '#ef6f6c',
              marginBottom: 4,
            }}
          >
            我的信息
          </div>
          <div
            style={{
              fontSize: 38,
              fontWeight: 800,
              lineHeight: 1.1,
            }}
          >
            {nickname}
          </div>
        </div>
        <div
          style={{
            fontSize: 16,
            color: '#667085',
            paddingTop: 6,
          }}
        >
          QQ {userId}
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          gap: 18,
          marginTop: 22,
        }}
      >
        <section
          style={{
            flex: 1,
            backgroundColor: '#fffdf4',
            border: '2px solid #f2bd5f',
            borderRadius: 8,
            padding: 18,
          }}
        >
          <div
            style={{
              fontSize: 18,
              fontWeight: 700,
              marginBottom: 14,
            }}
          >
            财产
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {currencyLabels.map((item) => (
              <div
                key={item.key}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'baseline',
                  fontSize: 18,
                }}
              >
                <span style={{ color: '#667085' }}>{item.label}</span>
                <span style={{ fontFamily: 'Roboto Mono', fontWeight: 750 }}>
                  {currency[item.key]}
                  {item.unit}
                </span>
              </div>
            ))}
          </div>
        </section>

        <section
          style={{
            width: 220,
            backgroundColor: '#e9fbf2',
            border: '2px solid #58c58b',
            borderRadius: 8,
            padding: 18,
          }}
        >
          <div
            style={{
              fontSize: 18,
              fontWeight: 700,
              marginBottom: 18,
            }}
          >
            牛牛长度
          </div>
          <div
            style={{
              fontSize: 24,
              fontWeight: 800,
              lineHeight: 1,
              fontFamily: 'Roboto Mono',
            }}
          >
            {dick.registered ? dick.lengthText : '未注册'}
          </div>
          <div
            style={{
              color: '#667085',
              fontSize: 15,
              marginTop: 12,
            }}
          >
            {dick.registered ? '当前记录' : '发送 注册牛牛 开始记录'}
          </div>
        </section>
      </div>

      <section
        style={{
          backgroundColor: '#edf7ff',
          border: '2px solid #6bb6ff',
          borderRadius: 8,
          marginTop: 18,
          padding: 18,
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 14,
          }}
        >
          <div
            style={{
              fontSize: 18,
              fontWeight: 700,
            }}
          >
            钓鱼库存
          </div>
          <div
            style={{
              color: '#667085',
              fontFamily: 'Roboto Mono',
              fontSize: 16,
            }}
          >
            🎣x{fishing.rod}
          </div>
        </div>

        {fishingInventory.length > 0 ? (
          <div
            style={{
              backgroundColor: '#ffffff',
              border: '2px solid #c3ddf3',
              borderRadius: 8,
              fontSize: 30,
              lineHeight: 1.6,
              padding: 12,
            }}
          >
            {fishingInventory}
          </div>
        ) : (
          <div
            style={{
              backgroundColor: '#ffffff',
              border: '2px solid #c3ddf3',
              borderRadius: 8,
              color: '#667085',
              fontSize: 16,
              padding: 12,
            }}
          >
            暂无钓鱼收获
          </div>
        )}
      </section>
    </div>
  );
}

export const previewProps: InfoCardProps = {
  nickname: 'T4kum1',
  userId: 10001,
  currency: {
    shell: 1234567,
    stamina: 88,
    charm: 5200,
    bomb: 3,
  },
  dick: {
    registered: true,
    lengthText: '16.08cm',
  },
  fishing: {
    rod: 2,
    items: [
      { emoji: '👞', count: 1 },
      { emoji: '🐚', count: 3 },
      { emoji: '🐸', count: 2 },
      { emoji: '🐠', count: 6 },
      { emoji: '⚡', count: 1 },
      { emoji: '💎', count: 1 },
    ],
  },
};

export const previewUseEmoji = true;
