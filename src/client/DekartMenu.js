import Dropdown from 'antd/es/dropdown'
import Menu from 'antd/es/menu'
import styles from './DekartMenu.module.css'
import { ExportOutlined } from '@ant-design/icons'

const menu = (
  <Menu>
    <Menu.Item>
      <a href='/'>Reports</a>
    </Menu.Item>
    <Menu.Item>
      <a target='_blank' rel='noopener noreferrer' href='https://github.com/dekart-xyz/dekart/issues'>Report Issue <ExportOutlined /></a>
    </Menu.Item>
  </Menu>
)

export default function DekartMenu () {
  return (
    <div className={styles.dekartMenu}>
      <Dropdown overlay={menu} placement='bottomCenter'>
        <div className={styles.dekart}>Dekart</div>
      </Dropdown>
    </div>
  )
}
